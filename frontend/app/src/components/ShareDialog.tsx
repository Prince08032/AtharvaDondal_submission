"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";

interface ShareDialogProps {
  assetId: string;
  assetFilename: string;
  assetVersion: number;
  onShare: (email: string, canDownload: boolean) => Promise<void>;
  onClose: () => void;
}

export function ShareDialog({
  assetId,
  assetFilename,
  assetVersion,
  onShare,
  onClose,
}: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [canDownload, setCanDownload] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setIsLoading(true);
      await onShare(email, canDownload);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to share asset");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Share Asset</h2>
          <button
            onClick={onClose}
            className="text-gray-400 cursor-pointer hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-4">
              Share <span className="font-medium">{assetFilename}</span> with
              another user
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={canDownload}
                onChange={(e) => setCanDownload(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                disabled={isLoading}
              />
              <span className="text-sm text-gray-700">Allow download</span>
            </label>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                "Sharing..."
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Share
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
