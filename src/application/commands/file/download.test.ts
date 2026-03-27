import { describe, expect, test } from "bun:test";

import { CliUserError } from "../../contracts/cli.ts";
import {
    formatByteCount,
    parseFileDownloadExtensionOption,
    parseFileDownloadNameOption,
} from "./download.ts";

describe("formatByteCount", () => {
    test("keeps byte-sized values in bytes", () => {
        expect(formatByteCount(0)).toBe("0 B");
        expect(formatByteCount(11)).toBe("11 B");
        expect(formatByteCount(1023)).toBe("1023 B");
    });

    test("uses larger units for kilobytes megabytes and gigabytes", () => {
        expect(formatByteCount(1024)).toBe("1 KB");
        expect(formatByteCount(1536)).toBe("1.5 KB");
        expect(formatByteCount(1024 * 1024)).toBe("1 MB");
        expect(formatByteCount(5.5 * 1024 * 1024)).toBe("5.5 MB");
        expect(formatByteCount(3 * 1024 * 1024 * 1024)).toBe("3 GB");
    });
});

describe("parseFileDownloadNameOption", () => {
    test("trims a valid value", () => {
        expect(parseFileDownloadNameOption("  backup  ")).toBe("backup");
    });

    test("rejects empty and path-like values", () => {
        expect(expectCliUserError(() => parseFileDownloadNameOption(""))).toMatchObject({
            key: "errors.fileDownload.invalidName",
        });
        expect(expectCliUserError(() => parseFileDownloadNameOption("../report"))).toMatchObject({
            key: "errors.fileDownload.invalidName",
        });
        expect(expectCliUserError(() => parseFileDownloadNameOption("."))).toMatchObject({
            key: "errors.fileDownload.invalidName",
        });
        expect(expectCliUserError(() => parseFileDownloadNameOption(".."))).toMatchObject({
            key: "errors.fileDownload.invalidName",
        });
    });
});

describe("parseFileDownloadExtensionOption", () => {
    test("normalizes a single leading dot", () => {
        expect(parseFileDownloadExtensionOption(".tar.gz")).toBe("tar.gz");
    });

    test("trims a valid value", () => {
        expect(parseFileDownloadExtensionOption("  txt  ")).toBe("txt");
    });

    test("rejects empty and path-like values", () => {
        expect(expectCliUserError(() => parseFileDownloadExtensionOption(""))).toMatchObject({
            key: "errors.fileDownload.invalidExt",
        });
        expect(expectCliUserError(() => parseFileDownloadExtensionOption("../txt"))).toMatchObject({
            key: "errors.fileDownload.invalidExt",
        });
        expect(expectCliUserError(() => parseFileDownloadExtensionOption("."))).toMatchObject({
            key: "errors.fileDownload.invalidExt",
        });
        expect(expectCliUserError(() => parseFileDownloadExtensionOption(".."))).toMatchObject({
            key: "errors.fileDownload.invalidExt",
        });
        expect(expectCliUserError(() => parseFileDownloadExtensionOption("..txt"))).toMatchObject({
            key: "errors.fileDownload.invalidExt",
        });
    });
});

function expectCliUserError(callback: () => unknown): CliUserError {
    try {
        callback();
    }
    catch (error) {
        if (error instanceof CliUserError) {
            return error;
        }

        throw error;
    }

    throw new Error("Expected a CliUserError to be thrown.");
}
