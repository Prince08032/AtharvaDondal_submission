import { GraphQLError } from "graphql";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function validateMimeType(mime: string): void {
  if (!ALLOWED_MIME_TYPES.includes(mime)) {
    throw new GraphQLError(
      `MIME type ${mime} not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(
        ", "
      )}`,
      {
        extensions: { code: "BAD_REQUEST" },
      }
    );
  }
}

export function validateFileSize(size: number): void {
  if (size <= 0 || size > MAX_FILE_SIZE) {
    throw new GraphQLError(
      `File size must be between 1 byte and ${MAX_FILE_SIZE} bytes (${
        MAX_FILE_SIZE / 1024 / 1024
      }MB)`,
      {
        extensions: { code: "BAD_REQUEST" },
      }
    );
  }
}

export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new GraphQLError("Invalid filename", {
      extensions: { code: "BAD_REQUEST" },
    });
  }

  // Remove path traversal attempts
  let safe = filename.replace(/\.\./g, "");

  // Remove any path separators
  safe = safe.replace(/[\/\\]/g, "");

  // Normalize unicode (NFC - Canonical Decomposition, followed by Canonical Composition)
  safe = safe.normalize("NFC");

  // Remove control characters and other dangerous characters
  safe = safe.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

  // Remove leading/trailing whitespace and dots
  safe = safe.trim().replace(/^\.+|\.+$/g, "");

  // Limit length
  if (safe.length > 255) {
    const lastDotIndex = safe.lastIndexOf(".");
    if (lastDotIndex > 0) {
      const ext = safe.substring(lastDotIndex);
      const nameWithoutExt = safe.substring(0, lastDotIndex);
      const maxNameLength = 250 - ext.length;
      safe = nameWithoutExt.substring(0, maxNameLength) + ext;
    } else {
      safe = safe.substring(0, 255);
    }
  }

  if (!safe || safe.length === 0) {
    throw new GraphQLError("Invalid filename after sanitization", {
      extensions: { code: "BAD_REQUEST" },
    });
  }

  return safe;
}

export function generateStoragePath(
  userId: string,
  assetId: string,
  filename: string
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const safeFilename = sanitizeFilename(filename);

  return `${userId}/${year}/${month}/${assetId}-${safeFilename}`;
}
