import type { Logger } from "pino";
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
import { requestOo, requestOoResponse } from "../shared/oo-request.ts";

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
    logger?: Logger,
): FileUploadRecordView {
    return {
        downloadUrl: normalizeFileUploadDownloadUrlForDisplay(
            record.downloadUrl,
            logger,
        ),
        expiresAt: new Date(record.expiresAtMs).toISOString(),
        fileName: record.fileName,
        fileSize: record.fileSize,
        id: record.id,
        status: readFileUploadStatus(record.expiresAtMs, now),
        uploadedAt: new Date(record.uploadedAtMs).toISOString(),
    };
}

export function normalizeFileUploadDownloadUrl(rawUrl: string): string {
    try {
        return normalizeFileUploadDownloadUrlValue(rawUrl);
    }
    catch {
        throw new CliUserError("errors.fileUpload.invalidResponse", 1);
    }
}

export function normalizeFileUploadDownloadUrlForDisplay(
    rawUrl: string,
    logger?: Logger,
): string {
    try {
        return normalizeFileUploadDownloadUrlValue(rawUrl);
    }
    catch (error) {
        logger?.debug(
            {
                errorName: error instanceof Error ? error.name : typeof error,
                rawUrlLength: rawUrl.length,
            },
            "Skipping URL normalization for unparseable legacy file upload record.",
        );
        return rawUrl;
    }
}

export async function createMultipartFileUpload(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    fileName: string,
    fileSize: number,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<MultipartUploadSession> {
    const response = await requestFileUploadAction(
        "create-multipart-upload",
        account,
        {
            fileSize,
            filename: fileName,
        },
        multipartUploadResponseSchema,
        context,
    );

    return {
        key: response.data.key,
        partSize: response.data.partSize,
        totalParts: response.data.totalParts,
        uploadID: response.data.uploadID,
    };
}

export async function generatePresignedFileUploadPartUrls(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    session: MultipartUploadSession,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<PresignedPartUrl[]> {
    const response = await requestFileUploadAction(
        "generate-presigned-urls",
        account,
        {
            key: session.key,
            partNumbers: Array.from(
                { length: session.totalParts },
                (_, index) => index + 1,
            ),
            uploadID: session.uploadID,
        },
        presignedPartUrlsResponseSchema,
        context,
    );

    return response.data;
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
    const response = await requestFileUploadAction(
        "complete-multipart-upload",
        account,
        {
            key: session.key,
            parts,
            uploadID: session.uploadID,
        },
        completeFileUploadResponseSchema,
        context,
    );

    return {
        downloadUrl: normalizeFileUploadDownloadUrl(response.data.downloadURL),
    };
}

export function readFileUploadStatus(
    expiresAtMs: number,
    now: number,
): FileUploadStatus {
    return expiresAtMs <= now ? "expired" : "active";
}

function normalizeFileUploadDownloadUrlValue(rawUrl: string): string {
    return new URL(rawUrl).href;
}

async function requestFileUploadAction<Value>(
    actionName: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    jsonBody: unknown,
    schema: { parse: (input: unknown) => Value },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<Value> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "fileUpload" },
        host: { endpoint: account.endpoint, service: "fusion-api" },
        jsonBody,
        label: "File upload",
        method: "POST",
        path: `/v1/file-upload/action/${actionName}`,
        schema,
    });
}

async function uploadFilePart(
    presignedUrl: string,
    partData: Blob,
    partNumber: number,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<UploadedPart> {
    const uploadPartFetcher = createRetryingFetcher({
        fetcher: context.fetcher,
        logger: context.logger,
        maxRetries: fileUploadPartExtraRetries,
    });

    // Materialize the part into a fresh Uint8Array before handing it to fetch.
    // A BunFile-backed Blob slice can trigger a segfault in Bun's FetchTasklet
    // teardown (Blob.Any.detach) — see crash report referenced in
    // https://github.com/oomol-lab/oo-cli/issues/242. Using an in-memory typed
    // array sidesteps the lazy file-backed code path entirely.
    const partBytes = new Uint8Array(await partData.arrayBuffer());

    const response = await requestOoResponse({
        body: partBytes,
        context: {
            fetcher: uploadPartFetcher,
            logger: context.logger,
            translator: context.translator,
        },
        errors: { scope: "fileUpload" },
        headers: {
            "Content-Type": "application/octet-stream",
        },
        host: { baseUrl: presignedUrl },
        label: "File upload part",
        logFields: {
            common: {
                partNumber,
            },
        },
        method: "PUT",
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
