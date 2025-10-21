import { UploadProgress, UploadState } from "../../../packages/shared/types";

export async function computeFileSHA256(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class UploadManager {
    private uploads = new Map<string, AbortController>();
    private onProgress: (progress: UploadProgress) => void;
    private graphqlEndpoint: string;
    private getAuthToken: () => Promise<string | null>;

    constructor(
        graphqlEndpoint: string,
        getAuthToken: () => Promise<string | null>,
        onProgress: (progress: UploadProgress) => void
    ) {
        this.graphqlEndpoint = graphqlEndpoint;
        this.getAuthToken = getAuthToken;
        this.onProgress = onProgress;
    }

    async uploadFile(file: File, simulateFlaky = false): Promise<string> {
        const abortController = new AbortController();
        const uploadId = crypto.randomUUID();

        this.uploads.set(uploadId, abortController);

        const updateProgress = (
            state: UploadState,
            progress: number,
            error?: string
        ) => {
            this.onProgress({
                assetId: uploadId,
                filename: file.name,
                state,
                progress,
                error,
            });
        };

        try {
            // Step 1: Request upload ticket
            updateProgress("requesting_ticket", 0);

            const token = await this.getAuthToken();
            if (!token) {
                throw new Error("Not authenticated");
            }

            const ticketResponse = await fetch(this.graphqlEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: `
            mutation CreateUploadUrl($filename: String!, $mime: String!, $size: Int!) {
              createUploadUrl(filename: $filename, mime: $mime, size: $size) {
                assetId
                storagePath
                uploadUrl
                expiresAt
                nonce
              }
            }
          `,
                    variables: {
                        filename: file.name,
                        mime: file.type,
                        size: file.size,
                    },
                }),
                signal: abortController.signal,
            });

            const ticketData = await ticketResponse.json();

            if (ticketData.errors) {
                throw new Error(ticketData.errors[0].message);
            }

            const ticket = ticketData.data.createUploadUrl;
            const assetId = ticket.assetId;

            // Update uploadId to actual assetId
            this.uploads.delete(uploadId);
            this.uploads.set(assetId, abortController);

            updateProgress("uploading", 5);

            // Step 2: Compute client-side SHA-256
            const clientSha256 = await computeFileSHA256(file);

            // Step 3: Upload file with progress
            await this.uploadWithProgress(
                ticket.uploadUrl,
                file,
                abortController.signal,
                (percent) =>
                    updateProgress("uploading", Math.min(5 + percent * 0.85, 90)),
                simulateFlaky
            );

            updateProgress("verifying", 95);

            // Step 4: Finalize upload
            const finalizeResponse = await fetch(this.graphqlEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: `
            mutation FinalizeUpload($assetId: ID!, $clientSha256: String!, $version: Int!) {
              finalizeUpload(assetId: $assetId, clientSha256: $clientSha256, version: $version) {
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
          `,
                    variables: {
                        assetId,
                        clientSha256,
                        version: 1,
                    },
                }),
                signal: abortController.signal,
            });

            const finalizeData = await finalizeResponse.json();

            if (finalizeData.errors) {
                const error = finalizeData.errors[0];
                if (error.extensions?.code === "INTEGRITY_ERROR") {
                    updateProgress("corrupt", 100, error.message);
                } else {
                    throw new Error(error.message);
                }
                return assetId;
            }

            const asset = finalizeData.data.finalizeUpload;

            updateProgress(asset.status as UploadState, 100);
            this.uploads.delete(assetId);

            return assetId;
        } catch (error: any) {
            if (error.name === "AbortError") {
                updateProgress("error", 0, "Upload cancelled");
            } else {
                updateProgress("error", 0, error.message);
            }
            throw error;
        }
    }

    private async uploadWithProgress(
        url: string,
        file: File,
        signal: AbortSignal,
        onProgress: (percent: number) => void,
        simulateFlaky = false
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;

                    // Simulate flaky network for testing
                    if (simulateFlaky && Math.random() < 0.15) {
                        xhr.abort();
                        reject(new Error("Simulated network failure"));
                        return;
                    }

                    onProgress(percent);
                }
            });

            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            });

            xhr.addEventListener("error", () => {
                reject(new Error("Upload failed"));
            });

            xhr.addEventListener("abort", () => {
                reject(new Error("Upload aborted"));
            });

            signal.addEventListener("abort", () => {
                xhr.abort();
            });

            xhr.open("PUT", url);
            xhr.setRequestHeader("Content-Type", file.type);
            xhr.send(file);
        });
    }

    cancelUpload(assetId: string) {
        const controller = this.uploads.get(assetId);
        if (controller) {
            controller.abort();
            this.uploads.delete(assetId);
        }
    }

    async retryUpload(assetId: string, file: File): Promise<void> {
        // For retry, we reuse the same assetId and just call finalize again
        const token = await this.getAuthToken();
        if (!token) {
            throw new Error("Not authenticated");
        }

        const clientSha256 = await computeFileSHA256(file);

        const finalizeResponse = await fetch(this.graphqlEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                query: `
          mutation FinalizeUpload($assetId: ID!, $clientSha256: String!, $version: Int!) {
            finalizeUpload(assetId: $assetId, clientSha256: $clientSha256, version: $version) {
              id
              status
            }
          }
        `,
                variables: {
                    assetId,
                    clientSha256,
                    version: 1,
                },
            }),
        });

        const data = await finalizeResponse.json();

        if (data.errors) {
            throw new Error(data.errors[0].message);
        }
    }
}
