import type { PathLike } from "node:fs";
import type { FileHandle } from "node:fs/promises";

import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isPathAccessDeniedError, isPathMissingError } from "./fs-errors.ts";

export async function pathExists(
    path: PathLike,
    metadataReader: (path: PathLike) => Promise<unknown> = stat,
): Promise<boolean> {
    try {
        await metadataReader(path);
        return true;
    }
    catch (error) {
        if (isPathMissingError(error)) {
            return false;
        }

        throw error;
    }
}

// Stricter sibling of pathExists: the path must be a file this process may
// execute. A directory placeholder or a non-executable file is not a usable
// binary. Windows has no execute bit, so being a file is enough there.
export async function isExecutableFile(
    path: PathLike,
    platform: NodeJS.Platform,
): Promise<boolean> {
    try {
        const metadata = await stat(path);

        if (!metadata.isFile()) {
            return false;
        }

        if (platform === "win32") {
            return true;
        }

        await access(path, constants.X_OK);
        return true;
    }
    catch (error) {
        if (isPathMissingError(error) || isPathAccessDeniedError(error)) {
            return false;
        }

        throw error;
    }
}

export async function writeChunk(
    fileHandle: Pick<FileHandle, "write">,
    chunk: Uint8Array,
): Promise<void> {
    let offset = 0;

    while (offset < chunk.byteLength) {
        const writeResult = await fileHandle.write(chunk.subarray(offset));
        const bytesWritten = writeResult.bytesWritten;

        if (bytesWritten <= 0) {
            const bytesRemaining = chunk.byteLength - offset;

            throw new Error(
                `File write made no progress: bytesRemaining=${bytesRemaining}, offset=${offset}.`,
            );
        }

        offset += bytesWritten;
    }
}
