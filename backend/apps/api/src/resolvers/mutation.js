"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mutation = void 0;
const graphql_1 = require("graphql");
const auth_1 = require("../utils/auth");
const validation_1 = require("../utils/validation");
const version_guard_1 = require("../utils/version-guard");
const crypto_1 = require("crypto");
const UPLOAD_TICKET_TTL = 300; // 5 minutes
exports.Mutation = {
    createUploadUrl: async (_, { filename, mime, size }, { supabaseAdmin, supabaseUser, user }) => {
        (0, auth_1.requireAuth)(user);
        if (!supabaseUser) {
            throw new graphql_1.GraphQLError('User client not initialized', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        (0, validation_1.validateMimeType)(mime);
        (0, validation_1.validateFileSize)(size);
        const safeFilename = (0, validation_1.sanitizeFilename)(filename);
        const assetId = crypto.randomUUID();
        const storagePath = (0, validation_1.generateStoragePath)(user.id, assetId, safeFilename);
        const nonce = (0, crypto_1.randomBytes)(32).toString('hex');
        console.log('Creating asset with user client for user:', user.id);
        // Use USER client for database operations (respects RLS)
        const { data: asset, error: assetError } = await supabaseUser
            .from('asset')
            .insert({
            id: assetId,
            owner_id: user.id,
            filename: safeFilename,
            mime,
            size,
            storage_path: storagePath,
            status: 'draft',
        })
            .select()
            .single();
        if (assetError) {
            console.error('Failed to create asset:', assetError);
            throw new graphql_1.GraphQLError('Failed to create asset', {
                extensions: { code: 'BAD_REQUEST', details: assetError.message },
            });
        }
        // Create upload ticket
        const expiresAt = new Date(Date.now() + UPLOAD_TICKET_TTL * 1000);
        const { error: ticketError } = await supabaseUser
            .from('upload_ticket')
            .insert({
            asset_id: assetId,
            user_id: user.id,
            nonce,
            mime,
            size,
            storage_path: storagePath,
            expires_at: expiresAt.toISOString(),
        });
        if (ticketError) {
            console.error('Failed to create upload ticket:', ticketError);
            throw new graphql_1.GraphQLError('Failed to create upload ticket', {
                extensions: { code: 'BAD_REQUEST', details: ticketError.message },
            });
        }
        // Use ADMIN client for storage operations
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('private')
            .createSignedUploadUrl(storagePath);
        if (uploadError || !uploadData) {
            console.error('Failed to create upload URL:', uploadError);
            throw new graphql_1.GraphQLError('Failed to create upload URL', {
                extensions: { code: 'BAD_REQUEST', details: uploadError?.message },
            });
        }
        return {
            assetId,
            storagePath,
            uploadUrl: uploadData.signedUrl,
            expiresAt: expiresAt.toISOString(),
            nonce,
        };
    },
    finalizeUpload: async (_, { assetId, clientSha256, version, }, { supabaseAdmin, supabaseUser, user }) => {
        (0, auth_1.requireAuth)(user);
        if (!supabaseUser) {
            throw new graphql_1.GraphQLError('User client not initialized', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        // Get and verify upload ticket (using user client)
        const { data: ticket, error: ticketError } = await supabaseUser
            .from('upload_ticket')
            .select('*')
            .eq('asset_id', assetId)
            .eq('user_id', user.id)
            .single();
        if (ticketError || !ticket) {
            throw new graphql_1.GraphQLError('Invalid or expired upload ticket', {
                extensions: { code: 'BAD_REQUEST' },
            });
        }
        // Check if ticket already used (idempotent behavior)
        if (ticket.used) {
            const { data: existingAsset } = await supabaseUser
                .from('asset')
                .select('*')
                .eq('id', assetId)
                .single();
            if (existingAsset && existingAsset.status === 'ready') {
                return {
                    id: existingAsset.id,
                    filename: existingAsset.filename,
                    mime: existingAsset.mime,
                    size: existingAsset.size,
                    sha256: existingAsset.sha256,
                    status: existingAsset.status,
                    version: existingAsset.version,
                    createdAt: existingAsset.created_at,
                    updatedAt: existingAsset.updated_at,
                };
            }
        }
        // Check ticket expiration
        if (new Date(ticket.expires_at) < new Date()) {
            throw new graphql_1.GraphQLError('Upload ticket expired', {
                extensions: { code: 'BAD_REQUEST' },
            });
        }
        // Mark ticket as used
        await supabaseUser
            .from('upload_ticket')
            .update({ used: true })
            .eq('asset_id', assetId);
        // Call Edge Function to compute server-side hash (using admin client)
        const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/hash-object`;
        let hashResponse;
        try {
            hashResponse = await fetch(edgeFunctionUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: ticket.storage_path,
                    expectedMime: ticket.mime,
                }),
            });
        }
        catch (error) {
            console.error('Edge Function request failed:', error);
            await supabaseUser
                .from('asset')
                .update({ status: 'corrupt' })
                .eq('id', assetId);
            throw new graphql_1.GraphQLError('Failed to verify file integrity', {
                extensions: { code: 'INTEGRITY_ERROR', details: error.message },
            });
        }
        if (!hashResponse.ok) {
            const errorData = await hashResponse.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Edge Function returned error:', errorData);
            await supabaseUser
                .from('asset')
                .update({ status: 'corrupt' })
                .eq('id', assetId);
            throw new graphql_1.GraphQLError(errorData.error || 'File integrity check failed', {
                extensions: { code: 'INTEGRITY_ERROR', details: errorData },
            });
        }
        const { sha256: serverSha256, size: serverSize } = await hashResponse.json();
        // Verify hash matches
        if (serverSha256.toLowerCase() !== clientSha256.toLowerCase()) {
            await supabaseUser
                .from('asset')
                .update({ status: 'corrupt' })
                .eq('id', assetId);
            throw new graphql_1.GraphQLError('Hash mismatch - file integrity check failed', {
                extensions: {
                    code: 'INTEGRITY_ERROR',
                    clientHash: clientSha256,
                    serverHash: serverSha256,
                },
            });
        }
        // Update asset to ready status
        const { data: updatedAsset, error: updateError } = await supabaseUser
            .from('asset')
            .update({
            sha256: serverSha256,
            status: 'ready',
            version: version + 1,
        })
            .eq('id', assetId)
            .eq('version', version)
            .select()
            .single();
        if (updateError) {
            console.error('Failed to finalize upload:', updateError);
            throw new graphql_1.GraphQLError('Failed to finalize upload', {
                extensions: { code: 'BAD_REQUEST', details: updateError.message },
            });
        }
        if (!updatedAsset) {
            throw new graphql_1.GraphQLError('Version conflict during finalization', {
                extensions: { code: 'VERSION_CONFLICT' },
            });
        }
        return {
            id: updatedAsset.id,
            filename: updatedAsset.filename,
            mime: updatedAsset.mime,
            size: updatedAsset.size,
            sha256: updatedAsset.sha256,
            status: updatedAsset.status,
            version: updatedAsset.version,
            createdAt: updatedAsset.created_at,
            updatedAt: updatedAsset.updated_at,
        };
    },
    renameAsset: async (_, { assetId, filename, version, }, { supabaseUser, user }) => {
        (0, auth_1.requireAuth)(user);
        if (!supabaseUser) {
            throw new graphql_1.GraphQLError('User client not initialized', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        const safeFilename = (0, validation_1.sanitizeFilename)(filename);
        const updatedAsset = await (0, version_guard_1.withVersionGuard)(supabaseUser, assetId, version, user.id, async () => {
            const { data, error } = await supabaseUser
                .from('asset')
                .update({
                filename: safeFilename,
                version: version + 1,
            })
                .eq('id', assetId)
                .eq('version', version)
                .select()
                .single();
            if (error) {
                console.error('Failed to rename asset:', error);
                throw new graphql_1.GraphQLError('Failed to rename asset', {
                    extensions: { code: 'BAD_REQUEST', details: error.message },
                });
            }
            if (!data) {
                throw new graphql_1.GraphQLError('Version conflict during rename', {
                    extensions: { code: 'VERSION_CONFLICT' },
                });
            }
            return data;
        });
        return {
            id: updatedAsset.id,
            filename: updatedAsset.filename,
            mime: updatedAsset.mime,
            size: updatedAsset.size,
            sha256: updatedAsset.sha256,
            status: updatedAsset.status,
            version: updatedAsset.version,
            createdAt: updatedAsset.created_at,
            updatedAt: updatedAsset.updated_at,
        };
    },
    shareAsset: async (_, { assetId, toEmail, canDownload, version, }, { supabaseAdmin, supabaseUser, user }) => {
        (0, auth_1.requireAuth)(user);
        if (!supabaseUser) {
            throw new graphql_1.GraphQLError('User client not initialized', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        // Find target user by email - using admin client
        const { data: users, error: userError } = await supabaseAdmin
            .rpc('get_user_by_email', { email_param: toEmail });
        if (userError || !users || users.length === 0) {
            throw new graphql_1.GraphQLError(`User with email ${toEmail} not found`, {
                extensions: { code: 'NOT_FOUND' },
            });
        }
        const targetUserId = users[0].id;
        await (0, version_guard_1.withVersionGuard)(supabaseUser, assetId, version, user.id, async () => {
            const { error } = await supabaseUser.from('asset_share').upsert({
                asset_id: assetId,
                to_user: targetUserId,
                can_download: canDownload,
            }, {
                onConflict: 'asset_id,to_user',
            });
            if (error) {
                console.error('Failed to share asset:', error);
                throw new graphql_1.GraphQLError('Failed to share asset', {
                    extensions: { code: 'BAD_REQUEST', details: error.message },
                });
            }
        });
        // Fetch updated asset
        const { data: asset } = await supabaseUser
            .from('asset')
            .select('*')
            .eq('id', assetId)
            .single();
        if (!asset) {
            throw new graphql_1.GraphQLError('Asset not found after sharing', {
                extensions: { code: 'NOT_FOUND' },
            });
        }
        return {
            id: asset.id,
            filename: asset.filename,
            mime: asset.mime,
            size: asset.size,
            sha256: asset.sha256,
            status: asset.status,
            version: asset.version,
            createdAt: asset.created_at,
            updatedAt: asset.updated_at,
        };
    },
    revokeShare: async (_, { assetId, toEmail, version, }, { supabaseAdmin, supabaseUser, user }) => {
        (0, auth_1.requireAuth)(user);
        if (!supabaseUser) {
            throw new graphql_1.GraphQLError('User client not initialized', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        // Find target user
        const { data: users } = await supabaseAdmin
            .rpc('get_user_by_email', { email_param: toEmail });
        if (!users || users.length === 0) {
            throw new graphql_1.GraphQLError(`User with email ${toEmail} not found`, {
                extensions: { code: 'NOT_FOUND' },
            });
        }
        const targetUserId = users[0].id;
        await (0, version_guard_1.withVersionGuard)(supabaseUser, assetId, version, user.id, async () => {
            await supabaseUser
                .from('asset_share')
                .delete()
                .eq('asset_id', assetId)
                .eq('to_user', targetUserId);
        });
        const { data: asset } = await supabaseUser
            .from('asset')
            .select('*')
            .eq('id', assetId)
            .single();
        if (!asset) {
            throw new graphql_1.GraphQLError('Asset not found', {
                extensions: { code: 'NOT_FOUND' },
            });
        }
        return {
            id: asset.id,
            filename: asset.filename,
            mime: asset.mime,
            size: asset.size,
            sha256: asset.sha256,
            status: asset.status,
            version: asset.version,
            createdAt: asset.created_at,
            updatedAt: asset.updated_at,
        };
    },
    deleteAsset: async (_, { assetId, version }, { supabaseAdmin, supabaseUser, user }) => {
        (0, auth_1.requireAuth)(user);
        if (!supabaseUser) {
            throw new graphql_1.GraphQLError('User client not initialized', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        await (0, version_guard_1.withVersionGuard)(supabaseUser, assetId, version, user.id, async () => {
            // Get storage path before deleting
            const { data: asset } = await supabaseUser
                .from('asset')
                .select('storage_path')
                .eq('id', assetId)
                .single();
            if (asset && asset.storage_path) {
                // Delete from storage (using admin client)
                const { error: storageError } = await supabaseAdmin.storage
                    .from('private')
                    .remove([asset.storage_path]);
                if (storageError) {
                    console.error('Failed to delete from storage:', storageError);
                }
            }
            // Delete from database (using user client)
            const { error } = await supabaseUser
                .from('asset')
                .delete()
                .eq('id', assetId)
                .eq('version', version);
            if (error) {
                console.error('Failed to delete asset:', error);
                throw new graphql_1.GraphQLError('Failed to delete asset', {
                    extensions: { code: 'BAD_REQUEST', details: error.message },
                });
            }
        });
        return true;
    },
};
