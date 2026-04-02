import type { CliExecutionContext } from "../../contracts/cli.ts";
import type {
    FileUploadRecord,
    FileUploadStatus,
} from "../../contracts/file-upload-store.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { parseEnumOption, parsePositiveIntegerOption } from "../shared/input-parsing.ts";
import { performLoggedRequest, requestText } from "../shared/request.ts";

export { createFormatInputError } from "../shared/input-parsing.ts";

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

export function parseFileFormat(
    value: string | undefined,
): FileFormat | undefined {
    return parseEnumOption(value, fileFormatValues, "errors.shared.invalidFormat");
}

export function parseFileLimit(value: string | undefined): number | undefined {
    return parsePositiveIntegerOption(
        value,
        "errors.shared.invalidPositiveIntegerOption",
        { min: 1, optionName: "--limit" },
    );
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
    pathSuffix: string,
): URL {
    return new URL(
        `https://llm.${endpoint}/api/tasks/files/remote-cache/${pathSuffix}`,
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
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
        Authorization: apiKey,
    };

    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    return await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.fileUpload.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.fileUpload.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            error: {
                method,
            },
            response: {
                method,
            },
            start: {
                bodyBytes: options.body?.length ?? 0,
                hasBody: options.body !== undefined,
                method,
                query: requestUrl.searchParams.toString(),
            },
        },
        init: {
            body: options.body,
            headers,
            method,
        },
        requestLabel: "File upload",
        requestUrl,
    });
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

        try {
            await performLoggedRequest({
                context,
                createRequestFailedError: status => new CliUserError(
                    "errors.fileUpload.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                createUnexpectedError: error => new CliUserError(
                    "errors.fileUpload.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                fields: {
                    common: {
                        attempt,
                        partNumber,
                    },
                    error: {
                        method: "PUT",
                    },
                    response: {
                        method: "PUT",
                    },
                    start: {
                        bodyBytes: partData.size,
                        method: "PUT",
                    },
                },
                init: {
                    body: partData,
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                    method: "PUT",
                },
                requestLabel: "File upload part",
                requestUrl,
            });
            return;
        }
        catch (error) {
            if (error instanceof CliUserError && attempt < maxAttempts) {
                await delayRetry(attempt);
                continue;
            }

            throw error;
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

    return Bun.sleep(delayMs);
}
