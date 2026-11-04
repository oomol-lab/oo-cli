import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { FileUploadRecord } from "../../contracts/file-upload-store.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { UploadSourceFile } from "../shared/upload-source-file.ts";
import type { TeamIdentity } from "../team/identity.ts";

import { resolve } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { maxFileUploadSizeBytes, uploadLocalFile } from "../file/shared.ts";
import { isPlainObject } from "../shared/schema-utils.ts";
import { readUploadSourceFile } from "../shared/upload-source-file.ts";

const fileReferenceKey = "$file";

// `.invalid` is reserved (RFC 2606), so the placeholder can never resolve if
// it leaked into a request; it only exists to satisfy `format: uri` checks
// while the payload is validated before any upload happens.
const placeholderUrlPrefix = "https://oo-file-reference.invalid/";

export interface ConnectorFileReference {
    /** Absolute local path the reference resolves to. */
    absolutePath: string;
    /** RFC 6901 JSON Pointer of the reference inside the `--data` payload. */
    inputPath: string;
    sourceFile: UploadSourceFile;
}

/** Public, URL-free description of one uploaded reference. */
export interface ConnectorFileReferenceUpload {
    expiresAt: string;
    fileName: string;
    fileSize: number;
    inputPath: string;
}

/**
 * Finds every `{ "$file": "<path>" }` marker in the payload and validates the
 * referenced local files. Only an object whose sole key is `$file` with a
 * non-empty string value counts; any other object containing `$file` is
 * rejected so a typo never silently sends the marker to the provider.
 */
export async function collectConnectorFileReferences(
    inputData: unknown,
    context: Pick<CliExecutionContext, "cwd" | "telemetry">,
): Promise<ConnectorFileReference[]> {
    const markers: Array<{ filePath: string; inputPath: string }> = [];

    visitFileReferenceMarkers(inputData, "", markers);

    const references: ConnectorFileReference[] = [];

    for (const marker of markers) {
        const sourceFile = await withInputPath(
            readUploadSourceFile(marker.filePath, context.cwd, {
                errorKeys: {
                    pathNotFile: "errors.connectorRun.fileReferenceNotFile",
                    readFailed: "errors.connectorRun.fileReferenceReadFailed",
                    tooLarge: "errors.connectorRun.fileReferenceTooLarge",
                },
                maxSizeBytes: maxFileUploadSizeBytes,
                recordTelemetryProperties: undefined,
            }),
            marker.inputPath,
        );

        references.push({
            absolutePath: resolve(context.cwd, marker.filePath),
            inputPath: marker.inputPath,
            sourceFile,
        });
    }

    return references;
}

/** Replaces every marker with a placeholder URL for pre-upload validation. */
export function replaceFileReferencesWithPlaceholders(
    inputData: unknown,
    references: readonly ConnectorFileReference[],
): unknown {
    const urlByAbsolutePath = new Map<string, string>();
    const urlByInputPath = new Map(references.map((reference) => {
        let url = urlByAbsolutePath.get(reference.absolutePath);

        if (url === undefined) {
            url = `${placeholderUrlPrefix}${urlByAbsolutePath.size}/${encodeURIComponent(reference.sourceFile.fileName)}`;
            urlByAbsolutePath.set(reference.absolutePath, url);
        }

        return [reference.inputPath, url];
    }));

    return replaceFileReferenceMarkers(inputData, "", urlByInputPath);
}

/**
 * Uploads each distinct referenced file once and returns the payload with
 * every marker replaced by its temporary download URL. Files are uploaded one
 * after another; each upload already sends its parts concurrently.
 */
export async function uploadConnectorFileReferences(
    inputData: unknown,
    references: readonly ConnectorFileReference[],
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    identity: TeamIdentity | undefined,
    context: Pick<CliExecutionContext, "fetcher" | "fileUploadStore" | "logger" | "translator">,
): Promise<{ inputData: unknown; uploads: ConnectorFileReferenceUpload[] }> {
    const recordByAbsolutePath = new Map<string, FileUploadRecord>();
    const urlByInputPath = new Map<string, string>();
    const uploads: ConnectorFileReferenceUpload[] = [];

    for (const reference of references) {
        let record = recordByAbsolutePath.get(reference.absolutePath);

        if (record === undefined) {
            record = await withInputPath(
                uploadLocalFile(reference.sourceFile, account, identity, context),
                reference.inputPath,
            );
            recordByAbsolutePath.set(reference.absolutePath, record);
        }

        urlByInputPath.set(reference.inputPath, record.downloadUrl);
        uploads.push({
            expiresAt: new Date(record.expiresAtMs).toISOString(),
            fileName: record.fileName,
            fileSize: record.fileSize,
            inputPath: reference.inputPath,
        });
    }

    return {
        inputData: replaceFileReferenceMarkers(inputData, "", urlByInputPath),
        uploads,
    };
}

function visitFileReferenceMarkers(
    value: unknown,
    inputPath: string,
    markers: Array<{ filePath: string; inputPath: string }>,
): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            visitFileReferenceMarkers(item, `${inputPath}/${index}`, markers);
        });
        return;
    }

    if (!isPlainObject(value)) {
        return;
    }

    if (Object.hasOwn(value, fileReferenceKey)) {
        const filePath = value[fileReferenceKey];

        if (
            Object.keys(value).length !== 1
            || typeof filePath !== "string"
            || filePath.trim() === ""
        ) {
            throw new CliUserError("errors.connectorRun.invalidFileReference", 2, {
                path: inputPath,
            }, {
                details: { inputPath },
            });
        }

        markers.push({ filePath, inputPath });
        return;
    }

    for (const [key, child] of Object.entries(value)) {
        visitFileReferenceMarkers(child, `${inputPath}/${escapeJsonPointerToken(key)}`, markers);
    }
}

function replaceFileReferenceMarkers(
    value: unknown,
    inputPath: string,
    urlByInputPath: ReadonlyMap<string, string>,
): unknown {
    const url = urlByInputPath.get(inputPath);

    if (url !== undefined) {
        return url;
    }

    if (Array.isArray(value)) {
        return value.map((item, index) =>
            replaceFileReferenceMarkers(item, `${inputPath}/${index}`, urlByInputPath),
        );
    }

    if (!isPlainObject(value)) {
        return value;
    }

    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key,
        replaceFileReferenceMarkers(
            child,
            `${inputPath}/${escapeJsonPointerToken(key)}`,
            urlByInputPath,
        ),
    ]));
}

// RFC 6901: `~` becomes `~0` and `/` becomes `~1`.
function escapeJsonPointerToken(token: string): string {
    return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

// Attaches the payload location to a failure so callers know which reference
// broke, without changing the error's code or message.
async function withInputPath<T>(operation: Promise<T>, inputPath: string): Promise<T> {
    try {
        return await operation;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw new CliUserError(error.key, error.exitCode, error.params, {
                code: error.code,
                details: { ...error.details, inputPath },
            });
        }

        throw error;
    }
}
