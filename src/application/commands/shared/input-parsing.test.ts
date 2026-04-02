import { describe, expect, test } from "bun:test";

import { CliUserError } from "../../contracts/cli.ts";
import {
    createFormatInputError,
    parseEnumOption,
    parsePositiveIntegerOption,
} from "./input-parsing.ts";

describe("parseEnumOption", () => {
    const allowed = ["json", "csv"] as const;

    test("returns undefined for undefined input", () => {
        expect(parseEnumOption(undefined, allowed, "err")).toBeUndefined();
    });

    test("returns the value when it matches an allowed value", () => {
        expect(parseEnumOption("json", allowed, "err")).toBe("json");
        expect(parseEnumOption("csv", allowed, "err")).toBe("csv");
    });

    test("throws CliUserError for an invalid value", () => {
        expect(() => parseEnumOption("xml", allowed, "err.key")).toThrowError(
            expect.objectContaining({
                exitCode: 2,
                key: "err.key",
                params: { value: "xml" },
            }),
        );
    });
});

describe("parsePositiveIntegerOption", () => {
    const opts = { optionName: "--page" };

    test("returns undefined for undefined input", () => {
        expect(parsePositiveIntegerOption(undefined, "err", opts)).toBeUndefined();
    });

    test("returns the parsed integer for a valid value", () => {
        expect(parsePositiveIntegerOption("5", "err", opts)).toBe(5);
    });

    test("throws for an empty string", () => {
        expect(() => parsePositiveIntegerOption("  ", "err.key", opts)).toThrowError(
            expect.objectContaining({ exitCode: 2, key: "err.key" }),
        );
    });

    test("throws for a non-integer value", () => {
        expect(() => parsePositiveIntegerOption("1.5", "err.key", opts)).toThrowError(
            expect.objectContaining({ exitCode: 2, key: "err.key" }),
        );
    });

    test("throws for a value below min", () => {
        expect(
            () => parsePositiveIntegerOption("0", "err.key", { min: 1, optionName: "--n" }),
        ).toThrowError(
            expect.objectContaining({ exitCode: 2 }),
        );
    });

    test("throws for a value above max", () => {
        expect(
            () => parsePositiveIntegerOption("101", "err.key", { max: 100, optionName: "--n" }),
        ).toThrowError(
            expect.objectContaining({ exitCode: 2 }),
        );
    });

    test("accepts a value equal to min and max boundaries", () => {
        expect(
            parsePositiveIntegerOption("1", "err", { min: 1, max: 100, optionName: "--n" }),
        ).toBe(1);
        expect(
            parsePositiveIntegerOption("100", "err", { min: 1, max: 100, optionName: "--n" }),
        ).toBe(100);
    });
});

describe("createFormatInputError", () => {
    test("returns a CliUserError with the format value", () => {
        const error = createFormatInputError({ format: "yaml" });

        expect(error).toBeInstanceOf(CliUserError);
        expect(error.exitCode).toBe(2);
        expect(error.key).toBe("errors.shared.invalidFormat");
        expect(error.params).toEqual({ value: "yaml" });
    });

    test("uses empty string when format is missing", () => {
        const error = createFormatInputError({});

        expect(error.params).toEqual({ value: "" });
    });
});
