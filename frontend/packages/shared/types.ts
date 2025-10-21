export type UploadState =
  | 'requesting_ticket'
  | 'uploading'
  | 'verifying'
  | 'corrupt'
  | 'error'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'ready';

/**
 * Progress payload sent to the UI.
 */
export interface UploadProgress {
  assetId: string;
  filename: string;
  state: UploadState;
  progress: number; // 0..100
  error?: string | null;
}

export type AssetStatus =
  | "requesting_ticket"
  | "uploading"
  | "verifying"
  | "corrupt"
  | "error"
  | "uploaded"
  | "processing"
  | "completed"
  | "ready"
  | "deleted";

/**
 * Asset model used across frontend components (e.g. AssetCard).
 */
export interface Asset {
  id: string;
  filename: string;
  mime: string;
  size: number;
  sha256?: string | null;
  status: AssetStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  storagePath?: string | null;
}