import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { expectCliUserError } from "../../../../__tests__/helpers.ts";
import {
    collectConnectorFileReferences,
    replaceFileReferencesWithPlaceholders,
} from "./file-references.ts";

describe("collectConnectorFileReferences", () => {
    test("finds nested references with RFC 6901 input paths", async () => {
        await withTemporaryDirectory(async (directory) => {
            await Bun.write(join(directory, "a.txt"), "a");
            await Bun.write(join(directory, "b.txt"), "bb");

            const references = await collectConnectorFileReferences(
                {
                    "attachments": [{ $file: "a.txt" }, { name: "kept" }],
                    "a/b~c": { $file: "./b.txt" },
                    "plain": "$file",
                },
                { cwd: directory },
            );

            expect(references.map(reference => ({
                absolutePath: reference.absolutePath,
                fileName: reference.sourceFile.fileName,
                fileSize: reference.sourceFile.fileSize,
                inputPath: reference.inputPath,
            }))).toEqual([
                {
                    absolutePath: join(directory, "a.txt"),
                    fileName: "a.txt",
                    fileSize: 1,
                    inputPath: "/attachments/0",
                },
                {
                    absolutePath: join(directory, "b.txt"),
                    fileName: "b.txt",
                    fileSize: 2,
                    inputPath: "/a~1b~0c",
                },
            ]);
        });
    });

    test("returns no references for payloads without markers", async () => {
        expect(await collectConnectorFileReferences(
            { to: "user@example.com", list: [1, "two", null] },
            { cwd: "/tmp" },
        )).toEqual([]);
    });

    test.each([
        { label: "extra keys", value: { $file: "a.txt", name: "a" } },
        { label: "a non-string path", value: { $file: 1 } },
        { label: "a blank path", value: { $file: "  " } },
    ])("rejects a marker with $label", async ({ value }) => {
        const error = await expectCliUserError(collectConnectorFileReferences(
            { attachment: value },
            { cwd: "/tmp" },
        ));

        expect(error.code).toBe("connectorRun.invalidFileReference");
        expect(error.exitCode).toBe(2);
        expect(error.details).toEqual({ inputPath: "/attachment" });
    });

    test("reports missing files with the input path", async () => {
        await withTemporaryDirectory(async (directory) => {
            const error = await expectCliUserError(collectConnectorFileReferences(
                { attachment: { $file: "missing.pdf" } },
                { cwd: directory },
            ));

            expect(error.code).toBe("connectorRun.fileReferenceReadFailed");
            expect(error.details).toEqual({ inputPath: "/attachment" });
        });
    });

    test("rejects references to directories", async () => {
        await withTemporaryDirectory(async (directory) => {
            await mkdir(join(directory, "folder"));

            const error = await expectCliUserError(collectConnectorFileReferences(
                { attachment: { $file: "folder" } },
                { cwd: directory },
            ));

            expect(error.code).toBe("connectorRun.fileReferenceNotFile");
            expect(error.details).toEqual({ inputPath: "/attachment" });
        });
    });
});

describe("replaceFileReferencesWithPlaceholders", () => {
    test("replaces only the referenced locations", async () => {
        await withTemporaryDirectory(async (directory) => {
            await Bun.write(join(directory, "my report.pdf"), "pdf");

            const inputData = {
                attachment: { $file: "my report.pdf" },
                subject: "Report",
            };
            const references = await collectConnectorFileReferences(inputData, { cwd: directory });

            expect(replaceFileReferencesWithPlaceholders(inputData, references)).toEqual({
                attachment: "https://oo-file-reference.invalid/my%20report.pdf",
                subject: "Report",
            });
            // The original payload is left untouched.
            expect(inputData.attachment).toEqual({ $file: "my report.pdf" });
        });
    });
});

async function withTemporaryDirectory(
    run: (directory: string) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "oo-file-references-"));

    try {
        await run(directory);
    }
    finally {
        await rm(directory, { force: true, recursive: true });
    }
}
