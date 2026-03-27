import { describe, expect, test } from "bun:test";

import {
    resolveDownloadFileName,
    splitFileNameParts,
} from "./file-name-utils.ts";

describe("resolveDownloadFileName", () => {
    test("uses the content disposition name and the final response url extension", () => {
        expect(resolveDownloadFileName({
            contentDisposition: "attachment; filename=\"report\"",
            responseUrl: "https://example.com/files/archive.tar.gz",
        })).toEqual({
            baseName: "report",
            extension: "tar.gz",
        });
    });

    test("prefers filename* over filename and strips directory segments", () => {
        expect(resolveDownloadFileName({
            contentDisposition:
                "attachment; filename=\"fallback.txt\"; filename*=UTF-8''nested%2Fpackage.pkg.tar.zst",
            responseUrl: "https://example.com/download",
        })).toEqual({
            baseName: "package",
            extension: "pkg.tar.zst",
        });
    });

    test("lets the explicit name and extension override automatic resolution independently", () => {
        expect(resolveDownloadFileName({
            contentDisposition: "attachment; filename=\"archive.tar.gz\"",
            requestedExtension: "txt",
            requestedName: "backup",
            responseUrl: "https://example.com/files/archive.zip",
        })).toEqual({
            baseName: "backup",
            extension: "txt",
        });
    });

    test("falls back to the default base name when the final response url has no last segment", () => {
        expect(resolveDownloadFileName({
            responseUrl: "https://example.com/files/",
        })).toEqual({
            baseName: "download",
        });
    });

    test("ignores query and fragment when inferring the file name from the response url", () => {
        expect(resolveDownloadFileName({
            responseUrl: "https://example.com/files/report.txt?download=1#section-2",
        })).toEqual({
            baseName: "report",
            extension: "txt",
        });
    });

    test("keeps only the last path segment from a content disposition filename", () => {
        expect(resolveDownloadFileName({
            contentDisposition: "attachment; filename=\"nested\\\\report.tar.gz\"",
            responseUrl: "https://example.com/download",
        })).toEqual({
            baseName: "report",
            extension: "tar.gz",
        });
    });

    test("does not infer an extension from application/octet-stream", () => {
        expect(resolveDownloadFileName({
            contentType: "application/octet-stream",
            responseUrl: "https://example.com/download",
        })).toEqual({
            baseName: "download",
        });
    });

    test("falls back to the next source when filename* is malformed", () => {
        const cases = [
            {
                contentDisposition:
                    "attachment; filename=\"fallback.txt\"; filename*=UTF-8''",
                expected: {
                    baseName: "download",
                    extension: "pdf",
                },
            },
            {
                contentDisposition:
                    "attachment; filename=\"fallback.txt\"; filename*=Shift_JIS''report.txt",
                expected: {
                    baseName: "download",
                    extension: "pdf",
                },
            },
            {
                contentDisposition:
                    "attachment; filename=\"fallback.txt\"; filename*=UTF-8''report%2",
                expected: {
                    baseName: "download",
                    extension: "pdf",
                },
            },
            {
                contentDisposition: "attachment; filename=\"unterminated.txt",
                expected: {
                    baseName: "download",
                    extension: "pdf",
                },
            },
            {
                contentDisposition: "attachment; filename=\"../\"",
                expected: {
                    baseName: "download",
                    extension: "pdf",
                },
            },
        ] as const;

        for (const testCase of cases) {
            expect(resolveDownloadFileName({
                contentDisposition: testCase.contentDisposition,
                contentType: "application/pdf",
                responseUrl: "https://example.com/download",
            })).toEqual(testCase.expected);
        }
    });

    test("uses mime type mappings for representative common formats", () => {
        const cases = [
            ["application/pdf", "pdf"],
            ["text/markdown; charset=utf-8", "md"],
            ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
            ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
            ["application/vnd.android.package-archive", "apk"],
            ["application/x-7z-compressed", "7z"],
            ["application/x-rpm", "rpm"],
            ["application/x-shellscript", "sh"],
            ["font/woff2", "woff2"],
            ["image/avif", "avif"],
            ["audio/flac", "flac"],
            ["video/webm", "webm"],
        ] as const;

        for (const [contentType, expectedExtension] of cases) {
            expect(resolveDownloadFileName({
                contentType,
                responseUrl: "https://example.com/download",
            })).toEqual({
                baseName: "download",
                extension: expectedExtension,
            });
        }
    });
});

describe("splitFileNameParts", () => {
    test("keeps configured composite extensions intact", () => {
        const cases = [
            ["archive.tar.gz", "archive", "tar.gz"],
            ["archive.tar.zst", "archive", "tar.zst"],
            ["backup.cpio.xz", "backup", "cpio.xz"],
            ["backup.cpio.bz2", "backup", "cpio.bz2"],
            ["package.pkg.tar.xz", "package", "pkg.tar.xz"],
            ["package.pkg.tar.zst", "package", "pkg.tar.zst"],
        ] as const;

        for (const [fileName, expectedBaseName, expectedExtension] of cases) {
            expect(splitFileNameParts(fileName)).toEqual({
                baseName: expectedBaseName,
                extension: expectedExtension,
            });
        }
    });

    test("falls back to the last dot when the suffix is not configured as composite", () => {
        const cases = [
            ["snapshot.data.gz", "snapshot.data", "gz"],
            ["report.final.br", "report.final", "br"],
            ["backup.custom.zst", "backup.custom", "zst"],
        ] as const;

        for (const [fileName, expectedBaseName, expectedExtension] of cases) {
            expect(splitFileNameParts(fileName)).toEqual({
                baseName: expectedBaseName,
                extension: expectedExtension,
            });
        }
    });
});
