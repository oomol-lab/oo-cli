import type { CliExecutionContext } from "../../contracts/cli.ts";
import type {
    FileUploadRecord,
    FileUploadStatus,
} from "../../contracts/file-upload-store.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import { readCurrentAuth } from "../auth/shared.ts";

export const fileFormatValues = ["json"] as const;
export const maxFileUploadSizeBytes = 512 * 1024 * 1024;

export type FileFormat = (typeof fileFormatValues)[number];

export interface FileUploadRecordView {
    downloadUrl: string;
    expiresAt: string;
    fileName: string;
    fileSize: number;
    id: string;
    status: FileUploadStatus;
    uploadedAt: string;
}

interface SliceableBlob {
    size: number;
    slice: (start?: number, end?: number) => Blob;
}

interface InitFileUploadResponse {
    uploadId: string;
    presignedUrls: Record<string, string>;
    partSize: number;
    totalParts: number;
}

interface FinalFileUploadResponse {
    expiresAtMs: number;
    url: string;
}

const initFileUploadResponseSchema = z.object({
    data: z.object({
        part_size: z.number().int().positive(),
        presigned_urls: z.record(z.string(), z.string().min(1)),
        total_parts: z.number().int().positive(),
        upload_id: z.string().min(1),
    }).passthrough(),
}).passthrough();

const finalFileUploadResponseSchema = z.object({
    data: z.object({
        expires_at: z.string().min(1),
        url: z.string().min(1),
    }).passthrough(),
}).passthrough();

export async function requireCurrentFileUploadAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount;
    }

    throw new CliUserError(
        authFile.id === ""
            ? "errors.fileUpload.authRequired"
            : "errors.fileUpload.activeAccountMissing",
        1,
    );
}

export function parseFileFormat(
    value: string | undefined,
): FileFormat | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === "json") {
        return value;
    }

    throw new CliUserError("errors.file.invalidFormat", 2, {
        value,
    });
}

export function parseFileLimit(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        throw new CliUserError("errors.fileList.invalidLimit", 2, {
            option: "--limit",
            value,
        });
    }

    const parsedValue = Number(trimmedValue);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
        throw new CliUserError("errors.fileList.invalidLimit", 2, {
            option: "--limit",
            value,
        });
    }

    return parsedValue;
}

export function parseFileStatus(
    value: string | undefined,
): FileUploadStatus | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === "active" || value === "expired") {
        return value;
    }

    throw new CliUserError("errors.fileList.invalidStatus", 2, {
        value,
    });
}

export function serializeFileUploadRecord(
    record: FileUploadRecord,
    now: number,
): FileUploadRecordView {
    return {
        downloadUrl: record.downloadUrl,
        expiresAt: new Date(record.expiresAtMs).toISOString(),
        fileName: record.fileName,
        fileSize: record.fileSize,
        id: record.id,
        status: readFileUploadStatus(record.expiresAtMs, now),
        uploadedAt: new Date(record.uploadedAtMs).toISOString(),
    };
}

export async function initFileUpload(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    fileName: string,
    fileSize: number,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<InitFileUploadResponse> {
    const [baseName, extension] = splitFileNameAndExtension(fileName);
    const requestUrl = createFileUploadRequestUrl(account.endpoint, "init");
    const rawResponse = await requestFileUpload(
        requestUrl,
        account.apiKey,
        context,
        {
            body: JSON.stringify({
                file_extension: extension,
                file_name: baseName,
                size: fileSize,
            }),
            method: "POST",
        },
    );

    try {
        const response = initFileUploadResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );

        return {
            partSize: response.data.part_size,
            presignedUrls: response.data.presigned_urls,
            totalParts: response.data.total_parts,
            uploadId: response.data.upload_id,
        };
    }
    catch {
        throw new CliUserError("errors.fileUpload.invalidResponse", 1);
    }
}

export async function uploadFileParts(
    file: SliceableBlob,
    session: InitFileUploadResponse,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<void> {
    for (let partNumber = 1; partNumber <= session.totalParts; partNumber += 1) {
        const presignedUrl = session.presignedUrls[String(partNumber)];

        if (!presignedUrl) {
            throw new CliUserError("errors.fileUpload.invalidResponse", 1);
        }

        const start = (partNumber - 1) * session.partSize;
        const end = Math.min(start + session.partSize, file.size);

        await uploadFilePart(
            presignedUrl,
            file.slice(start, end),
            partNumber,
            context,
        );
    }
}

export async function resolveUploadedFileUrl(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    uploadId: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<FinalFileUploadResponse> {
    const requestUrl = createFileUploadRequestUrl(
        account.endpoint,
        `${encodeURIComponent(uploadId)}/url`,
    );
    const rawResponse = await requestFileUpload(
        requestUrl,
        account.apiKey,
        context,
    );

    try {
        const response = finalFileUploadResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
        const expiresAtMs = Date.parse(response.data.expires_at);

        if (!Number.isFinite(expiresAtMs)) {
            throw new TypeError("Invalid expires_at value.");
        }

        return {
            expiresAtMs,
            url: response.data.url,
        };
    }
    catch {
        throw new CliUserError("errors.fileUpload.invalidResponse", 1);
    }
}

export function readFileUploadStatus(
    expiresAtMs: number,
    now: number,
): FileUploadStatus {
    return expiresAtMs <= now ? "expired" : "active";
}

function createFileUploadRequestUrl(
    endpoint: string,
    pathSuffix?: string,
): URL {
    return new URL(
        `https://llm.${endpoint}/api/tasks/files/remote-cache/${pathSuffix ?? ""}`,
    );
}

async function requestFileUpload(
    requestUrl: URL,
    apiKey: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
    options: {
        body?: string;
        method?: string;
    } = {},
): Promise<string> {
    const requestStartedAt = Date.now();
    const method = options.method ?? "GET";

    context.logger.debug(
        {
            bodyBytes: options.body?.length ?? 0,
            hasBody: options.body !== undefined,
            method,
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            query: requestUrl.searchParams.toString(),
        },
        "File upload request started.",
    );

    try {
        const headers: Record<string, string> = {
            Authorization: apiKey,
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await context.fetcher(requestUrl, {
            body: options.body,
            headers,
            method,
        });
        const durationMs = Date.now() - requestStartedAt;

        if (!response.ok) {
            context.logger.warn(
                {
                    durationMs,
                    method,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    status: response.status,
                },
                "File upload request returned a non-success status.",
            );
            throw new CliUserError("errors.fileUpload.requestFailed", 1, {
                status: response.status,
            });
        }

        context.logger.debug(
            {
                durationMs,
                method,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                status: response.status,
            },
            "File upload request completed.",
        );

        return await response.text();
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                method,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "File upload request failed unexpectedly.",
        );
        throw new CliUserError("errors.fileUpload.requestError", 1, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

async function uploadFilePart(
    presignedUrl: string,
    partData: Blob,
    partNumber: number,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const requestUrl = new URL(presignedUrl);
        const requestStartedAt = Date.now();

        context.logger.debug(
            {
                attempt,
                bodyBytes: partData.size,
                method: "PUT",
                partNumber,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "File upload part request started.",
        );

        try {
            const response = await context.fetcher(requestUrl, {
                body: partData,
                headers: {
                    "Content-Type": "application/octet-stream",
                },
                method: "PUT",
            });
            const durationMs = Date.now() - requestStartedAt;

            if (!response.ok) {
                context.logger.warn(
                    {
                        attempt,
                        durationMs,
                        method: "PUT",
                        partNumber,
                        ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                        status: response.status,
                    },
                    "File upload part request returned a non-success status.",
                );

                if (attempt === maxAttempts) {
                    throw new CliUserError("errors.fileUpload.requestFailed", 1, {
                        status: response.status,
                    });
                }

                await delayRetry(attempt);
                continue;
            }

            context.logger.debug(
                {
                    attempt,
                    durationMs,
                    method: "PUT",
                    partNumber,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    status: response.status,
                },
                "File upload part request completed.",
            );

            return;
        }
        catch (error) {
            if (error instanceof CliUserError) {
                throw error;
            }

            context.logger.warn(
                {
                    attempt,
                    durationMs: Date.now() - requestStartedAt,
                    err: error,
                    method: "PUT",
                    partNumber,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                },
                "File upload part request failed unexpectedly.",
            );

            if (attempt === maxAttempts) {
                throw new CliUserError("errors.fileUpload.requestError", 1, {
                    message: error instanceof Error ? error.message : String(error),
                });
            }

            await delayRetry(attempt);
        }
    }
}

function splitFileNameAndExtension(fileName: string): [string, string] {
    const lastDotIndex = fileName.lastIndexOf(".");

    if (lastDotIndex === -1) {
        return [fileName, ""];
    }

    return [
        fileName.slice(0, lastDotIndex),
        fileName.slice(lastDotIndex),
    ];
}

function delayRetry(attempt: number): Promise<void> {
    const delayMs = Math.min(30_000, 2 ** (attempt - 1) * 1_000);

    return new Promise(resolve => setTimeout(resolve, delayMs));
}
