import type { FileHandle } from "node:fs/promises";

import { describe, expect, test } from "bun:test";
import { writeChunk } from "./fs-utils.ts";

describe("fs utils", () => {
    test("writeChunk retries partial writes until the chunk is complete", async () => {
        const writtenSegments: number[][] = [];
        const fileHandle = createFileHandleWriteStub((buffer) => {
            writtenSegments.push([...buffer]);

            return Math.min(2, buffer.byteLength);
        });

        await writeChunk(fileHandle, Uint8Array.from([1, 2, 3, 4, 5]));

        expect(writtenSegments).toEqual([
            [1, 2, 3, 4, 5],
            [3, 4, 5],
            [5],
        ]);
    });

    test("writeChunk fails when a write makes no progress", async () => {
        const fileHandle = createFileHandleWriteStub(() => 0);

        await expect(writeChunk(
            fileHandle,
            Uint8Array.from([1, 2, 3]),
        )).rejects.toThrow(
            "File write made no progress: bytesRemaining=3, offset=0.",
        );
    });
});

function createFileHandleWriteStub(
    writer: (buffer: Uint8Array) => number | Promise<number>,
): Pick<FileHandle, "write"> {
    return {
        async write(data: string | NodeJS.ArrayBufferView) {
            if (typeof data === "string") {
                throw new TypeError("Expected binary data.");
            }

            const buffer = new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength,
            );

            return {
                buffer: data,
                bytesWritten: await writer(buffer),
            };
        },
    } as Pick<FileHandle, "write">;
}
