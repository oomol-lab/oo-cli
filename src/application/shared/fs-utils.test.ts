import type { FileHandle } from "node:fs/promises";

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { isExecutableFile, pathExists, writeChunk } from "./fs-utils.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("fs utils", () => {
    test("pathExists treats a file in the middle of the path as missing", async () => {
        const metadataReader = async () => {
            const error = new Error("not a directory") as NodeJS.ErrnoException;

            error.code = "ENOTDIR";
            throw error;
        };

        expect(await pathExists("/tmp/version/oo", metadataReader)).toBeFalse();
    });

    test("isExecutableFile returns true for an executable file", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-fs-utils-executable");
        const executablePath = join(rootDirectory, "bin", "oo");

        trackDirectory(rootDirectory);
        await writeExecutable(executablePath);

        expect(await isExecutableFile(executablePath, process.platform)).toBeTrue();
    });

    test("isExecutableFile returns false for a directory", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-fs-utils-directory");
        const executablePath = join(rootDirectory, "bin", "oo");

        trackDirectory(rootDirectory);
        await mkdir(executablePath, { recursive: true });

        expect(await isExecutableFile(executablePath, process.platform)).toBeFalse();
    });

    test("isExecutableFile returns false for a non-executable file on POSIX", async () => {
        if (process.platform === "win32") {
            return;
        }

        const rootDirectory = await createTemporaryDirectory("oo-fs-utils-non-executable");
        const executablePath = join(rootDirectory, "bin", "oo");

        trackDirectory(rootDirectory);
        await mkdir(dirname(executablePath), { recursive: true });
        await writeFile(executablePath, "binary", { mode: 0o644 });

        expect(await isExecutableFile(executablePath, process.platform)).toBeFalse();
    });

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

async function writeExecutable(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "binary");

    if (process.platform !== "win32") {
        await chmod(path, 0o755);
    }
}
