import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
    createInteractiveInput,
    expectCliUserError,
} from "../../../../__tests__/helpers.ts";
import { readJsonInputValue } from "./json-input.ts";

const errorKeys = {
    dataFilePathRequired: "errors.test.dataFilePathRequired",
    dataReadFailed: "errors.test.dataReadFailed",
    invalidDataJson: "errors.test.invalidDataJson",
};

describe("readJsonInputValue", () => {
    test("returns the default value for missing or blank input", async () => {
        const context = createContext();

        expect(await readJsonInputValue(undefined, context, errorKeys, { fallback: true }))
            .toEqual({ fallback: true });
        expect(await readJsonInputValue("  ", context, errorKeys, {}))
            .toEqual({});
    });

    test("parses inline JSON", async () => {
        expect(await readJsonInputValue("{\"a\":1}", createContext(), errorKeys, {}))
            .toEqual({ a: 1 });
    });

    test("reads JSON from stdin with @-", async () => {
        const stdin = createInteractiveInput({ isTTY: false });
        stdin.feed("﻿{\"to\":");
        stdin.feed("\"user@example.com\"}");
        stdin.end();

        expect(await readJsonInputValue("@-", createContext({ stdin }), errorKeys, {}))
            .toEqual({ to: "user@example.com" });
    });

    test("rejects @- when stdin is an interactive terminal", async () => {
        const stdin = createInteractiveInput({ isTTY: true });

        const error = await expectCliUserError(
            readJsonInputValue("@-", createContext({ stdin }), errorKeys, {}),
        );

        expect(error.key).toBe("errors.shared.stdinInputTty");
        expect(error.exitCode).toBe(2);
    });

    test("rejects a second @- read from the same stdin", async () => {
        const stdin = createInteractiveInput({ isTTY: false });
        stdin.feed("{}");
        stdin.end();
        const context = createContext({ stdin });

        await readJsonInputValue("@-", context, errorKeys, {});
        const error = await expectCliUserError(
            readJsonInputValue("@-", context, errorKeys, {}),
        );

        expect(error.key).toBe("errors.shared.stdinInputConsumed");
        expect(error.exitCode).toBe(2);
    });

    test("reports empty stdin as invalid JSON", async () => {
        const stdin = createInteractiveInput({ isTTY: false });
        stdin.end();

        const error = await expectCliUserError(
            readJsonInputValue("@-", createContext({ stdin }), errorKeys, {}),
        );

        expect(error.key).toBe("errors.test.invalidDataJson");
        expect(error.exitCode).toBe(2);
    });

    test("reads a file literally named - through @./-", async () => {
        const directory = await mkdtemp(join(tmpdir(), "oo-json-input-"));

        try {
            await writeFile(join(directory, "-"), "{\"file\":true}");

            expect(await readJsonInputValue(
                "@./-",
                createContext({ cwd: directory }),
                errorKeys,
                {},
            )).toEqual({ file: true });
        }
        finally {
            await rm(directory, { force: true, recursive: true });
        }
    });
});

function createContext(
    overrides: {
        cwd?: string;
        stdin?: ReturnType<typeof createInteractiveInput>;
    } = {},
) {
    return {
        cwd: overrides.cwd ?? "/tmp",
        stdin: overrides.stdin ?? createInteractiveInput({ isTTY: false }),
    };
}
