import type { BunFile } from "bun";
import type { Stats } from "node:fs";
import type { MessageKey } from "../../../i18n/catalog.ts";
import type { CliExecutionContext } from "../../contracts/cli.ts";

import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";

export interface UploadSourceFile {
    file: BunFile;
    fileName: string;
    fileSize: number;
}

// The per-command error keys, so each upload command keeps its own wording
// (and its own size limit in the tooLarge message) while sharing the checks.
export interface UploadSourceFileErrorKeys {
    pathNotFile: MessageKey;
    readFailed: MessageKey;
    tooLarge: MessageKey;
}

export type RecordTelemetryProperties = NonNullable<
    CliExecutionContext["telemetry"]
>["recordProperties"];

interface ReadUploadSourceFileOptions {
    errorKeys: UploadSourceFileErrorKeys;
    maxSizeBytes: number;
    recordTelemetryProperties: RecordTelemetryProperties | undefined;
}

// Resolves and validates the local file an upload command sends: it must be
// a regular file no larger than the command's limit. A rejected size is
// recorded as bucketed telemetry before throwing, so oversize attempts stay
// visible without the path or file name.
export async function readUploadSourceFile(
    filePath: string,
    cwd: string,
    options: ReadUploadSourceFileOptions,
): Promise<UploadSourceFile> {
    const resolvedPath = resolve(cwd, filePath);
    let metadata: Stats;

    try {
        metadata = await stat(resolvedPath);
    }
    catch (error) {
        throw new CliUserError(options.errorKeys.readFailed, 1, {
            message: error instanceof Error ? error.message : String(error),
            path: resolvedPath,
        });
    }

    if (!metadata.isFile()) {
        throw new CliUserError(options.errorKeys.pathNotFile, 1, {
            path: resolvedPath,
        });
    }

    if (metadata.size > options.maxSizeBytes) {
        options.recordTelemetryProperties?.({
            bytes_total_bucket: bucketTelemetryBytes(metadata.size),
            rejected_too_large: true,
        });
        throw new CliUserError(options.errorKeys.tooLarge, 2, {
            max: options.maxSizeBytes,
            path: resolvedPath,
            size: metadata.size,
        });
    }

    return {
        file: Bun.file(resolvedPath),
        fileName: basename(resolvedPath),
        fileSize: metadata.size,
    };
}
