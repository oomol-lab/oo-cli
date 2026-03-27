import { describe, expect, test } from "bun:test";

import { CliUserError } from "../../../contracts/cli.ts";
import {
    parseFileDownloadExtensionOption,
    parseFileDownloadNameOption,
} from "./input.ts";

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
