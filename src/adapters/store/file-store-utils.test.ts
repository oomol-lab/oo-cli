import { describe, expect, test } from "bun:test";

import {
    isFileAlreadyExistsError,
    isFileMissingError,
} from "./file-store-utils.ts";

describe("file store utils", () => {
    test("detects missing-file errors by ENOENT", () => {
        const missingError = new Error("missing") as NodeJS.ErrnoException;
        missingError.code = "ENOENT";

        expect(isFileMissingError(missingError)).toBe(true);
        expect(isFileMissingError(new Error("other"))).toBe(false);
        expect(isFileMissingError({
            code: "ENOENT",
        })).toBe(false);
    });

    test("detects existing-file errors by EEXIST", () => {
        const existsError = new Error("exists") as NodeJS.ErrnoException;
        existsError.code = "EEXIST";

        expect(isFileAlreadyExistsError(existsError)).toBe(true);
        expect(isFileAlreadyExistsError(new Error("other"))).toBe(false);
    });
});
