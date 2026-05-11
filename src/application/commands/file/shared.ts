import type { CliExecutionContext } from "../../contracts/cli.ts";
import type {
    FileUploadRecord,
    FileUploadStatus,
} from "../../contracts/file-upload-store.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createRetryingFetcher } from "../../shared/retrying-fetcher.ts";
import { parseEnumOption, parsePositiveIntegerOption } from "../shared/input-parsing.ts";
import { performLoggedRequest, requestText } from "../shared/request.ts";

export { createFormatInputError } from "../shared/input-parsing.ts";

export const fileFormatValues = ["json"] as const;
export const fileUploadExpiresInMs = ((7 * 24 * 60 * 60) - 1) * 1000;
export const maxFileUploadSizeBytes = 500 * 1024 * 1024;

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

interface MultipartUploadSession {
    key: string;
    partSize: number;
    totalParts: number;
    uploadID: string;
}

interface PresignedPartUrl {
    partNumber: number;
    uploadURL: string;
}

interface UploadedPart {
    etag: string;
    partNumber: number;
}

interface CompleteFileUploadResponse {
    downloadUrl: string;
}

const multipartUploadResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        key: z.string().min(1),
        partSize: z.number().int().positive(),
        totalParts: z.number().int().positive(),
        uploadID: z.string().min(1),
    }).passthrough(),
}).passthrough();

const presignedPartUrlsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(z.object({
        partNumber: z.number().int().positive(),
        uploadURL: z.string().min(1),
    }).passthrough()),
}).passthrough();

const completeFileUploadResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        downloadURL: z.string().min(1),
    }).passthrough(),
}).passthrough();

const fileUploadPartExtraRetries = 1;

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

export async function createMultipartFileUpload(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    fileName: string,
    fileSize: number,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<MultipartUploadSession> {
    const requestUrl = createFileUploadRequestUrl(
        account.endpoint,
        "create-multipart-upload",
    );
    const rawResponse = await requestFileUpload(
        requestUrl,
        account.apiKey,
        context,
        {
            body: JSON.stringify({
                fileSize,
                filename: fileName,
            }),
            method: "POST",
        },
    );

    try {
        const response = multipartUploadResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );

        return {
            key: response.data.key,
            partSize: response.data.partSize,
            totalParts: response.data.totalParts,
            uploadID: response.data.uploadID,
        };
    }
    catch {
        throw new CliUserError("errors.fileUpload.invalidResponse", 1);
    }
}

export async function generatePresignedFileUploadPartUrls(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    session: MultipartUploadSession,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<PresignedPartUrl[]> {
    const requestUrl = createFileUploadRequestUrl(
        account.endpoint,
        "generate-presigned-urls",
    );
    const rawResponse = await requestFileUpload(
        requestUrl,
        account.apiKey,
        context,
        {
            body: JSON.stringify({
                key: session.key,
                partNumbers: Array.from(
                    { length: session.totalParts },
                    (_, index) => index + 1,
                ),
                uploadID: session.uploadID,
            }),
            method: "POST",
        },
    );

    try {
        return presignedPartUrlsResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        ).data;
    }
    catch {
        throw new CliUserError("errors.fileUpload.invalidResponse", 1);
    }
}

export async function uploadFileParts(
    file: SliceableBlob,
    session: MultipartUploadSession,
    presignedPartUrls: readonly PresignedPartUrl[],
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<UploadedPart[]> {
    const presignedUrlByPartNumber = new Map(
        presignedPartUrls.map(part => [part.partNumber, part.uploadURL]),
    );
    const uploadedParts: UploadedPart[] = [];

    for (let partNumber = 1; partNumber <= session.totalParts; partNumber += 1) {
        const presignedUrl = presignedUrlByPartNumber.get(partNumber);

        if (!presignedUrl) {
            throw new CliUserError("errors.fileUpload.invalidResponse", 1);
        }

        const start = (partNumber - 1) * session.partSize;
        const end = Math.min(start + session.partSize, file.size);

        uploadedParts.push(await uploadFilePart(
            presignedUrl,
            file.slice(start, end),
            partNumber,
            context,
        ));
    }

    return uploadedParts;
}

export async function completeMultipartFileUpload(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    session: MultipartUploadSession,
    parts: readonly UploadedPart[],
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<CompleteFileUploadResponse> {
    const requestUrl = createFileUploadRequestUrl(
        account.endpoint,
        "complete-multipart-upload",
    );
    const rawResponse = await requestFileUpload(
        requestUrl,
        account.apiKey,
        context,
        {
            body: JSON.stringify({
                key: session.key,
                parts,
                uploadID: session.uploadID,
            }),
            method: "POST",
        },
    );

    try {
        const response = completeFileUploadResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );

        return {
            downloadUrl: response.data.downloadURL,
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
    actionName: string,
): URL {
    return new URL(
        `https://fusion-api.${endpoint}/v1/file-upload/action/${actionName}`,
    );
}

async function requestFileUpload(
    requestUrl: URL,
    apiKey: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
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
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<UploadedPart> {
    const requestUrl = new URL(presignedUrl);
    const uploadPartFetcher = createRetryingFetcher({
        fetcher: context.fetcher,
        logger: context.logger,
        maxRetries: fileUploadPartExtraRetries,
    });

<<<<<<< ours
    const response = await performLoggedRequest({
        context,
||||||| ancestor
    await performLoggedRequest({
        context,
=======
    await performLoggedRequest({
        context: {
            fetcher: uploadPartFetcher,
            logger: context.logger,
            translator: context.translator,
        },
>>>>>>> theirs
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

    const etag = response.headers.get("ETag");
    if (!etag) {
        throw new CliUserError("errors.fileUpload.invalidResponse", 1);
    }

    return {
        etag,
        partNumber,
    };
}
