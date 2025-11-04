"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Query = void 0;
const graphql_1 = require("graphql");
const auth_1 = require("../utils/auth");
const DOWNLOAD_LINK_TTL = 90; // seconds
exports.Query = {
    /**
     * Fetches the authenticated user's assets.
     * Supports search and cursor-based pagination.
     */
    myAssets: async (_, { after, first = 20, q }, { supabaseUser, supabaseAdmin, user }) => {
        (0, auth_1.requireAuth)(user);
        const supabase = supabaseUser ?? supabaseAdmin; // pick user client if available
        if (!supabase) {
            throw new graphql_1.GraphQLError("Supabase client is not initialized", {
                extensions: { code: "INTERNAL_SERVER_ERROR" },
            });
        }
        // Build base query
        let query = supabase
            .from("asset")
            .select("*")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(first + 1);
        // Search by filename (optional)
        if (q?.trim()) {
            query = query.ilike("filename", `%${q.trim()}%`);
        }
        // Cursor-based pagination
        if (after) {
            try {
                const decodedCursor = Buffer.from(after, "base64").toString("utf-8");
                query = query.lt("created_at", decodedCursor);
            }
            catch {
                throw new graphql_1.GraphQLError("Invalid pagination cursor", {
                    extensions: { code: "BAD_REQUEST" },
                });
            }
        }
        // Execute query
        const { data: assets, error } = await query;
        if (error) {
            console.error("❌ Failed to fetch assets:", error);
            throw new graphql_1.GraphQLError("Failed to fetch assets", {
                extensions: { code: "BAD_REQUEST", details: error.message },
            });
        }
        const hasNextPage = assets.length > first;
        const items = assets.slice(0, first);
        // Create edges with cursors
        const edges = items.map((asset) => ({
            cursor: Buffer.from(asset.created_at).toString("base64"),
            node: {
                id: asset.id,
                filename: asset.filename,
                mime: asset.mime,
                size: asset.size,
                sha256: asset.sha256,
                status: asset.status,
                version: asset.version,
                createdAt: asset.created_at,
                updatedAt: asset.updated_at,
            },
        }));
        return {
            edges,
            pageInfo: {
                endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
                hasNextPage,
            },
        };
    },
    /**
     * Generates a short-lived signed URL for downloading an asset.
     */
    getDownloadUrl: async (_, { assetId }, { supabaseUser, supabaseAdmin, user }) => {
        (0, auth_1.requireAuth)(user);
        const supabase = supabaseUser ?? supabaseAdmin;
        if (!supabase) {
            throw new graphql_1.GraphQLError("Supabase client is not initialized", {
                extensions: { code: "INTERNAL_SERVER_ERROR" },
            });
        }
        // Check if the asset belongs to the user
        const { data: asset, error: assetError } = await supabase
            .from("asset")
            .select("*")
            .eq("id", assetId)
            .eq("owner_id", user.id)
            .single();
        let finalAsset = asset;
        // If not owner, check if asset is shared with user
        if (assetError || !asset) {
            const { data: sharedAsset, error: shareError } = await supabase
                .from("asset")
                .select(`
          *,
          asset_share!inner(to_user, can_download)
        `)
                .eq("id", assetId)
                .eq("asset_share.to_user", user.id)
                .eq("asset_share.can_download", true)
                .single();
            if (shareError || !sharedAsset) {
                throw new graphql_1.GraphQLError("Asset not found or access denied", {
                    extensions: { code: "FORBIDDEN" },
                });
            }
            finalAsset = sharedAsset;
        }
        if (!finalAsset) {
            throw new graphql_1.GraphQLError("Asset not found", {
                extensions: { code: "NOT_FOUND" },
            });
        }
        if (finalAsset.status !== "ready") {
            throw new graphql_1.GraphQLError(`Asset not ready for download (status: ${finalAsset.status})`, { extensions: { code: "BAD_REQUEST" } });
        }
        // Create a signed download URL
        const { data: signedUrl, error: signError } = await supabase.storage
            .from("private")
            .createSignedUrl(finalAsset.storage_path, DOWNLOAD_LINK_TTL);
        if (signError || !signedUrl) {
            console.error("❌ Failed to generate download link:", signError);
            throw new graphql_1.GraphQLError("Failed to generate download link", {
                extensions: { code: "BAD_REQUEST", details: signError?.message },
            });
        }
        // Log the download (for audit)
        await supabase.from("download_audit").insert({
            asset_id: assetId,
            user_id: user.id,
        });
        return {
            url: signedUrl.signedUrl,
            expiresAt: new Date(Date.now() + DOWNLOAD_LINK_TTL * 1000).toISOString(),
        };
    },
};
