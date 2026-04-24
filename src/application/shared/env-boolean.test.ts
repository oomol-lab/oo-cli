import { describe, expect, test } from "bun:test";
import { readEnvBoolean } from "./env-boolean.ts";

describe("readEnvBoolean", () => {
    test("returns undefined when the variable is unset", () => {
        expect(readEnvBoolean(undefined)).toBeUndefined();
    });

    test("reads common truthy strings regardless of case or padding", () => {
        for (const raw of ["1", "true", "TRUE", "  yes  ", "On", "On\n"]) {
            expect(readEnvBoolean(raw)).toBeTrue();
        }
    });

    test("reads common falsy strings regardless of case or padding", () => {
        for (const raw of ["0", "false", "No", "off", "", "   "]) {
            expect(readEnvBoolean(raw)).toBeFalse();
        }
    });

    test("returns undefined for unrecognized values so callers can decide", () => {
        for (const raw of ["maybe", "2", "banana"]) {
            expect(readEnvBoolean(raw)).toBeUndefined();
        }
    });
});
