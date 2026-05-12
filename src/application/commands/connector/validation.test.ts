import { describe, expect, test } from "bun:test";

import { createTranslator } from "../../../i18n/translator.ts";
import { validateConnectorActionInput } from "./validation.ts";

const englishTranslator = createTranslator("en");

describe("validateConnectorActionInput", () => {
    test("accepts valid input payloads", () => {
        expect(() =>
            validateConnectorActionInput(
                {
                    to: "foo@bar.com",
                },
                createEmailSchema(),
                englishTranslator,
            )).not.toThrow();
    });

    test("accepts normalized file upload download URLs as uri-formatted image input", () => {
        expect(() =>
            validateConnectorActionInput(
                {
                    images: [
                        {
                            image_url: "https://download.example.com/files/%E5%8C%851.jpg",
                        },
                    ],
                },
                createImageInputSchema(),
                englishTranslator,
            )).not.toThrow();
    });

    test("rejects invalid payloads with the connector invalid-payload error", () => {
        expect(() =>
            validateConnectorActionInput(
                {
                    to: "not-an-email",
                },
                createEmailSchema(),
                englishTranslator,
            )).toThrow("errors.connectorRun.invalidPayload");
    });

    test("rejects invalid schemas with the connector invalid-schema error", () => {
        expect(() =>
            validateConnectorActionInput(
                {
                    to: "foo@bar.com",
                },
                {
                    $ref: "missing-schema",
                },
                englishTranslator,
            )).toThrow("errors.connectorRun.invalidActionSchema");
    });
});

function createEmailSchema(): Record<string, unknown> {
    return {
        properties: {
            to: {
                format: "email",
                type: "string",
            },
        },
        required: ["to"],
        type: "object",
    };
}

function createImageInputSchema(): Record<string, unknown> {
    return {
        properties: {
            images: {
                items: {
                    properties: {
                        image_url: {
                            anyOf: [
                                {
                                    format: "uri",
                                    type: "string",
                                },
                                {
                                    pattern: "^data:image/[^;,]+;base64,.*",
                                    type: "string",
                                },
                            ],
                        },
                    },
                    required: ["image_url"],
                    type: "object",
                },
                type: "array",
            },
        },
        required: ["images"],
        type: "object",
    };
}
