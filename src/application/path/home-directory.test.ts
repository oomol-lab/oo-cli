import { describe, expect, test } from "bun:test";

import {
    expandHomeDirectoryPath,
    resolveHomeDirectory,
} from "./home-directory.ts";

describe("resolveHomeDirectory", () => {
    test("prefers an explicit home directory", () => {
        expect(resolveHomeDirectory({ HOME: "/env-home" }, "/explicit-home")).toBe(
            "/explicit-home",
        );
    });

    test("falls back to HOME when no explicit value is provided", () => {
        expect(resolveHomeDirectory({ HOME: "/env-home" })).toBe("/env-home");
    });
});

describe("expandHomeDirectoryPath", () => {
    test("expands a standalone tilde", () => {
        expect(expandHomeDirectoryPath("~", { HOME: "/env-home" })).toBe(
            "/env-home",
        );
    });

    test("expands a leading tilde path", () => {
        expect(
            expandHomeDirectoryPath("~/Downloads/reports", {
                HOME: "/env-home",
            }),
        ).toBe("/env-home/Downloads/reports");
    });

    test("leaves non-tilde values untouched", () => {
        expect(
            expandHomeDirectoryPath("./downloads", {
                HOME: "/env-home",
            }),
        ).toBe("./downloads");
    });
});
