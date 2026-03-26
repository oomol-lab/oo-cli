import type { PackageInfoResponse } from "../package/shared.ts";

import { describe, expect, test } from "bun:test";

import { createTranslator } from "../../../i18n/translator.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { validateCloudTaskInputValues } from "./validation.ts";

const englishTranslator = createTranslator("en");

describe("validateCloudTaskInputValues", () => {
    test("accepts 6-digit and 8-digit hex values for color widgets", () => {
        const block = createBlock("accent", {
            description: "Accent color",
            ext: {
                widget: "color",
            },
            schema: {
                type: "string",
            },
        });

        expect(() =>
            validateCloudTaskInputValues(
                {
                    accent: "#7D7FE9",
                },
                block,
                englishTranslator,
            )).not.toThrow();
        expect(() =>
            validateCloudTaskInputValues(
                {
                    accent: "#08080F73",
                },
                block,
                englishTranslator,
            )).not.toThrow();
    });

    test("rejects non-hex values for color widgets", () => {
        const block = createBlock("accent", {
            description: "Accent color",
            ext: {
                widget: "color",
            },
            schema: {
                type: "string",
            },
        });

        expect(expectCliUserError(() =>
            validateCloudTaskInputValues(
                {
                    accent: "rgb(125, 127, 233)",
                },
                block,
                englishTranslator,
            ),
        )).toMatchObject({
            key: "errors.cloudTaskRun.invalidPayload",
            params: expect.objectContaining({
                handle: "accent",
                message: expect.stringContaining("hex-color"),
            }),
        });
    });

    test("patches file widget schemas to uri before accepting valid strings", () => {
        const block = createBlock("input", {
            description: "Input file",
            ext: {
                widget: "file",
            },
            schema: {
                type: "string",
            },
        });

        expect(() =>
            validateCloudTaskInputValues(
                {
                    input: "https://example.com/files/input.txt",
                },
                block,
                englishTranslator,
            )).not.toThrow();
    });

    test("patches file widget schemas to uri before rejecting invalid strings", () => {
        const block = createBlock("input", {
            description: "Input file",
            ext: {
                widget: "file",
            },
            schema: {
                type: "string",
            },
        });

        expect(expectCliUserError(() =>
            validateCloudTaskInputValues(
                {
                    input: "./files/input.txt",
                },
                block,
                englishTranslator,
            ),
        )).toMatchObject({
            key: "errors.cloudTaskRun.invalidPayload",
            params: expect.objectContaining({
                handle: "input",
                message: expect.stringContaining("uri"),
            }),
        });
    });

    test("accepts Unix-style storage paths for save widgets", () => {
        const block = createBlock("output", {
            description: "Output path",
            ext: {
                widget: "save",
            },
            schema: {
                type: "string",
            },
        });

        expect(() =>
            validateCloudTaskInputValues(
                {
                    output: "/oomol-driver/oomol-storage/project/result.txt",
                },
                block,
                englishTranslator,
            )).not.toThrow();
    });

    test("rejects save widget paths outside the oomol storage prefix", () => {
        const block = createBlock("output", {
            description: "Output path",
            ext: {
                widget: "save",
            },
            schema: {
                type: "string",
            },
        });

        expect(expectCliUserError(() =>
            validateCloudTaskInputValues(
                {
                    output: "/tmp/result.txt",
                },
                block,
                englishTranslator,
            ),
        )).toMatchObject({
            key: "errors.cloudTaskRun.invalidPayload",
            params: expect.objectContaining({
                handle: "output",
                message: expect.stringContaining("/oomol-driver/oomol-storage/"),
            }),
        });
    });

    test("rejects dir widget paths that use Windows separators", () => {
        const block = createBlock("workspace", {
            description: "Workspace path",
            ext: {
                widget: "dir",
            },
            schema: {
                type: "string",
            },
        });

        expect(expectCliUserError(() =>
            validateCloudTaskInputValues(
                {
                    workspace: "/oomol-driver/oomol-storage/project\\cache",
                },
                block,
                englishTranslator,
            ),
        )).toMatchObject({
            key: "errors.cloudTaskRun.invalidPayload",
            params: expect.objectContaining({
                handle: "workspace",
                message: expect.stringContaining("Unix-style path"),
            }),
        });
    });

    test("rejects credential widgets even when no value is provided", () => {
        const block = createBlock("account", {
            description: "Account credential",
            ext: {
                widget: "credential",
            },
            schema: {
                type: "string",
            },
        });

        expect(expectCliUserError(() =>
            validateCloudTaskInputValues(
                {},
                block,
                englishTranslator,
            ),
        )).toMatchObject({
            key: "errors.cloudTaskRun.invalidPayload",
            params: expect.objectContaining({
                handle: "account",
                message: expect.stringContaining("not supported in the CLI"),
            }),
        });
    });
});

function createBlock(
    handleName: string,
    handle: PackageInfoResponse["blocks"][number]["inputHandle"][string],
): PackageInfoResponse["blocks"][number] {
    return {
        blockName: "main",
        description: "Main block",
        inputHandle: {
            [handleName]: handle,
        },
        outputHandle: {},
        title: "Main",
    };
}

function expectCliUserError(callback: () => void): CliUserError {
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
