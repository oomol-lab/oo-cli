import { describe, expect, test } from "bun:test";

import { expectCliUserError } from "../../../../../__tests__/helpers.ts";
import {
    parseFileDownloadExtensionOption,
    parseFileDownloadNameOption,
    parseFileDownloadUrl,
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

describe("parseFileDownloadUrl", () => {
    test("normalizes raw non-ASCII URL input", () => {
        const fileName = "\u53051.jpg";

        expect(
            parseFileDownloadUrl(`https://download.example.com/${fileName}`).toString(),
        ).toBe("https://download.example.com/%E5%8C%851.jpg");
    });
});
