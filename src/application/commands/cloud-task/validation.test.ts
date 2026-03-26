import type { PackageInfoResponse } from "../package/shared.ts";

import { describe, expect, test } from "bun:test";

import { CliUserError } from "../../contracts/cli.ts";
import { validateCloudTaskInputValues } from "./validation.ts";

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
                "en",
            )).not.toThrow();
        expect(() =>
            validateCloudTaskInputValues(
                {
                    accent: "#08080F73",
                },
                block,
                "en",
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
                "en",
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
                "en",
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
                "en",
            ),
        )).toMatchObject({
            key: "errors.cloudTaskRun.invalidPayload",
            params: expect.objectContaining({
                handle: "input",
                message: expect.stringContaining("uri"),
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
