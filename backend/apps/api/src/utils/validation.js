"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMimeType = validateMimeType;
exports.validateFileSize = validateFileSize;
exports.sanitizeFilename = sanitizeFilename;
exports.generateStoragePath = generateStoragePath;
const graphql_1 = require("graphql");
const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
function validateMimeType(mime) {
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
        throw new graphql_1.GraphQLError(`MIME type ${mime} not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`, {
            extensions: { code: "BAD_REQUEST" },
        });
    }
}
function validateFileSize(size) {
    if (size <= 0 || size > MAX_FILE_SIZE) {
        throw new graphql_1.GraphQLError(`File size must be between 1 byte and ${MAX_FILE_SIZE} bytes (${MAX_FILE_SIZE / 1024 / 1024}MB)`, {
            extensions: { code: "BAD_REQUEST" },
        });
    }
}
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== "string") {
        throw new graphql_1.GraphQLError("Invalid filename", {
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
        }
        else {
            safe = safe.substring(0, 255);
        }
    }
    if (!safe || safe.length === 0) {
        throw new graphql_1.GraphQLError("Invalid filename after sanitization", {
            extensions: { code: "BAD_REQUEST" },
        });
    }
    return safe;
}
function generateStoragePath(userId, assetId, filename) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const safeFilename = sanitizeFilename(filename);
    return `${userId}/${year}/${month}/${assetId}-${safeFilename}`;
}
