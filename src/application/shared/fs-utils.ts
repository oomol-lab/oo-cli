import type { PathLike } from "node:fs";
import type { FileHandle } from "node:fs/promises";

import { stat } from "node:fs/promises";
import { isFileMissingError } from "./fs-errors.ts";

export async function pathExists(
    path: PathLike,
    metadataReader: (path: PathLike) => Promise<unknown> = stat,
): Promise<boolean> {
    try {
        await metadataReader(path);
        return true;
    }
    catch (error) {
        if (isFileMissingError(error)) {
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

        offset += writeResult.bytesWritten;
    }
}
