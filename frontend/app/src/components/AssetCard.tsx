"use client";

import { useState, useRef, useEffect } from "react";
import {
  Download,
  Edit2,
  Trash2,
  Share2,
  X,
  Check,
  AlertCircle,
  RotateCcw,
  Loader2,
  Clock,
} from "lucide-react";
import { Asset } from "../../../packages/shared/types";

interface AssetCardProps {
  asset: Asset;
  onRename: (
    assetId: string,
    newName: string,
    version: number
  ) => Promise<void>;
  onDelete: (assetId: string, version: number) => Promise<void>;
  onShare: (assetId: string) => void;
  onDownload: (assetId: string) => Promise<{ url: string; expiresAt: string }>;
  uploadProgress?: number;
  uploadState?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

export function AssetCard({
  asset,
  onRename,
  onDelete,
  onShare,
  onDownload,
  uploadProgress,
  uploadState,
  onRetry,
  onCancel,
}: AssetCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(asset.filename);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [linkExpiry, setLinkExpiry] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (linkExpiry) {
      const interval = setInterval(() => {
        const now = new Date();
        const diff = Math.max(
          0,
          Math.floor((linkExpiry.getTime() - now.getTime()) / 1000)
        );
        setTimeLeft(diff);

        if (diff === 0) {
          setDownloadLink(null);
          setLinkExpiry(null);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [linkExpiry]);

  const handleRename = async () => {
    if (editedName.trim() && editedName !== asset.filename) {
      try {
        setIsLoading(true);
        await onRename(asset.id, editedName.trim(), asset.version);
        setIsEditing(false);
      } catch (error: any) {
        if (error.message.includes("VERSION_CONFLICT")) {
          alert(
            "This asset was modified by another user. Please refresh and try again."
          );
        } else {
          alert(`Failed to rename: ${error.message}`);
        }
        setEditedName(asset.filename);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsEditing(false);
      setEditedName(asset.filename);
    }
  };

  const handleCopyLink = async () => {
    try {
      setIsLoading(true);
      const { url, expiresAt } = await onDownload(asset.id);
      setDownloadLink(url);
      setLinkExpiry(new Date(expiresAt));

      await navigator.clipboard.writeText(url);
    } catch (error: any) {
      alert(`Failed to get download link: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Delete "${asset.filename}"?`)) {
      try {
        await onDelete(asset.id, asset.version);
      } catch (error: any) {
        alert(`Failed to delete: ${error.message}`);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getStatusBadge = () => {
    if (uploadState === "uploading") {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-blue-600">
            Uploading {uploadProgress}%
          </span>
        </div>
      );
    }

    if (uploadState === "verifying") {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
          <span className="text-sm font-medium text-purple-600">
            Verifying...
          </span>
        </div>
      );
    }

    switch (asset.status) {
      case "ready":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Ready
          </span>
        );
      case "corrupt":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Corrupt
          </span>
        );
      case "uploading":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Uploading
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {asset.status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4">
        {/* Progress bar for uploading */}
        {uploadState === "uploading" && uploadProgress !== undefined && (
          <div className="mb-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Filename */}
        <div className="flex items-center justify-between mb-2">
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                ref={inputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setIsEditing(false);
                    setEditedName(asset.filename);
                  }
                }}
                className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleRename}
                disabled={isLoading}
                className="p-1 text-green-600 cursor-pointer hover:bg-green-50 rounded"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedName(asset.filename);
                }}
                className="p-1 text-gray-600 cursor-pointer hover:bg-gray-50 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <h3
              className="font-medium text-gray-900 truncate flex-1"
              title={asset.filename}
            >
              {asset.filename}
            </h3>
          )}
        </div>

        {/* Status and metadata */}
        <div className="flex items-center justify-between mb-3">
          {getStatusBadge()}
          <span className="text-sm text-gray-500">
            {formatFileSize(asset.size)}
          </span>
        </div>

        {/* Download link countdown */}
        {downloadLink && linkExpiry && timeLeft > 0 && (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded flex items-center gap-2">
            <Clock className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700 flex-1">
              Link expires in {timeLeft}s
            </span>
          </div>
        )}

        {/* Error state */}
        {uploadState === "error" && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">Upload failed</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {asset.status === "ready" && (
            <>
              <button
                onClick={handleCopyLink}
                disabled={isLoading}
                className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Copy Link
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                title="Rename"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onShare(asset.id)}
                className="p-1.5 cursor-pointer text-gray-600 hover:bg-gray-100 rounded"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </>
          )}

          {uploadState === "error" && onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-50 rounded hover:bg-orange-100"
            >
              <RotateCcw className="w-4 h-4" />
              Retry
            </button>
          )}

          {(uploadState === "uploading" || uploadState === "verifying") &&
            onCancel && (
              <button
                onClick={onCancel}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            )}

          <button
            onClick={handleDelete}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
