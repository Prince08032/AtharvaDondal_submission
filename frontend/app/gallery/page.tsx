"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Asset, UploadProgress } from "@/packages/shared/types";
import { UploadManager } from "../src/lib/upload-manager";
import supabase, { getAuthToken } from "../src/lib/supabase";
import { graphqlRequest } from "../src/lib/graphql-client";
import { AssetCard } from "../src/components/AssetCard";
import { UploadZone } from "../src/components/UploadZone";
import { ShareDialog } from "../src/components/ShareDialog";

const GRAPHQL_ENDPOINT =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "http://localhost:4000/graphql";

export default function GalleryPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(
    new Map()
  );
  const [uploadManager, setUploadManager] = useState<UploadManager | null>(
    null
  );
  const [shareDialogAsset, setShareDialogAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [devToolsEnabled, setDevToolsEnabled] = useState(false);
  const [flakyNetworkEnabled, setFlakyNetworkEnabled] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth");
        return;
      }
      setUser(session.user);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.push("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (user) {
      const manager = new UploadManager(
        GRAPHQL_ENDPOINT,
        getAuthToken,
        (progress) => {
          setUploads((prev) => new Map(prev).set(progress.assetId, progress));
        }
      );
      setUploadManager(manager);
      fetchAssets();
    }
  }, [user]);

  const fetchAssets = async () => {
    try {
      setIsLoading(true);
      const token = await getAuthToken();
      const data = await graphqlRequest(
        GRAPHQL_ENDPOINT,
        `
          query MyAssets {
            myAssets(first: 100) {
              edges {
                node {
                  id
                  filename
                  mime
                  size
                  sha256
                  status
                  version
                  createdAt
                  updatedAt
                }
              }
            }
          }
        `,
        {},
        token || undefined
      );

      setAssets(data.myAssets.edges.map((edge: any) => edge.node));
    } catch (error) {
      console.error("Failed to fetch assets:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!uploadManager) return;

    for (const file of files) {
      try {
        await uploadManager.uploadFile(file, flakyNetworkEnabled);
        // Refresh assets after successful upload
        await fetchAssets();
      } catch (error) {
        console.error("Upload failed:", error);
      }
    }
  };

  const handleRename = async (
    assetId: string,
    newName: string,
    version: number
  ) => {
    const token = await getAuthToken();
    const data = await graphqlRequest(
      GRAPHQL_ENDPOINT,
      `
        mutation RenameAsset($assetId: ID!, $filename: String!, $version: Int!) {
          renameAsset(assetId: $assetId, filename: $filename, version: $version) {
            id
            filename
            version
          }
        }
      `,
      { assetId, filename: newName, version },
      token || undefined
    );

    // Update local state
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              filename: data.renameAsset.filename,
              version: data.renameAsset.version,
            }
          : asset
      )
    );
  };

  const handleDelete = async (assetId: string, version: number) => {
    const token = await getAuthToken();
    await graphqlRequest(
      GRAPHQL_ENDPOINT,
      `
        mutation DeleteAsset($assetId: ID!, $version: Int!) {
          deleteAsset(assetId: $assetId, version: $version)
        }
      `,
      { assetId, version },
      token || undefined
    );

    // Remove from local state
    setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  };

  const handleDownload = async (assetId: string) => {
    const token = await getAuthToken();
    const data = await graphqlRequest(
      GRAPHQL_ENDPOINT,
      `
        query GetDownloadUrl($assetId: ID!) {
          getDownloadUrl(assetId: $assetId) {
            url
            expiresAt
          }
        }
      `,
      { assetId },
      token || undefined
    );

    return data.getDownloadUrl;
  };

  const handleShare = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (asset) {
      setShareDialogAsset(asset);
    }
  };

  const handleShareSubmit = async (email: string, canDownload: boolean) => {
    if (!shareDialogAsset) return;

    const token = await getAuthToken();
    await graphqlRequest(
      GRAPHQL_ENDPOINT,
      `
        mutation ShareAsset($assetId: ID!, $toEmail: String!, $canDownload: Boolean!, $version: Int!) {
          shareAsset(assetId: $assetId, toEmail: $toEmail, canDownload: $canDownload, version: $version) {
            id
            version
          }
        }
      `,
      {
        assetId: shareDialogAsset.id,
        toEmail: email,
        canDownload,
        version: shareDialogAsset.version,
      },
      token || undefined
    );

    await fetchAssets();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleRetry = (assetId: string) => {
    // Retry logic would go here
    console.log("Retry upload:", assetId);
  };

  const handleCancel = (assetId: string) => {
    if (uploadManager) {
      uploadManager.cancelUpload(assetId);
      setUploads((prev) => {
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Secure Media Vault
              </h1>
              {user && (
                <p className="text-sm text-gray-600 mt-1">{user.email}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDevToolsEnabled(!devToolsEnabled)}
                className="p-2 cursor-pointer text-gray-600 hover:bg-gray-100 rounded-lg"
                title="Dev Tools"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleSignOut}
                className="flex cursor-pointer items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dev Tools Panel */}
        {devToolsEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-900 mb-3">
              🛠️ Developer Tools
            </h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={flakyNetworkEnabled}
                onChange={(e) => setFlakyNetworkEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-yellow-900">
                Simulate flaky network (15% packet loss)
              </span>
            </label>
          </div>
        )}

        {/* Upload Zone */}
        <div className="mb-8">
          <UploadZone
            onFilesSelected={handleFilesSelected}
            disabled={!uploadManager}
          />
        </div>

        {/* Active Uploads */}
        {uploads.size > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Active Uploads
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from(uploads.values()).map((upload) => (
                <AssetCard
                  key={upload.assetId}
                  asset={{
                    id: upload.assetId,
                    filename: upload.filename,
                    mime: "",
                    size: 0,
                    sha256: null,
                    status: upload.state,
                    version: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }}
                  uploadProgress={upload.progress}
                  uploadState={upload.state}
                  onRename={async () => {}}
                  onDelete={async () => {}}
                  onShare={() => {}}
                  onDownload={async () => ({ url: "", expiresAt: "" })}
                  onRetry={() => handleRetry(upload.assetId)}
                  onCancel={() => handleCancel(upload.assetId)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Assets Gallery */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            My Assets ({assets.length})
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">
                No assets yet. Upload your first file above!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onShare={handleShare}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Share Dialog */}
      {shareDialogAsset && (
        <ShareDialog
          assetId={shareDialogAsset.id}
          assetFilename={shareDialogAsset.filename}
          assetVersion={shareDialogAsset.version}
          onShare={handleShareSubmit}
          onClose={() => setShareDialogAsset(null)}
        />
      )}
    </div>
  );
}
