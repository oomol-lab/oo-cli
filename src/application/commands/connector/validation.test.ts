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
                {
                    properties: {
                        to: {
                            format: "email",
                            type: "string",
                        },
                    },
                    required: ["to"],
                    type: "object",
                },
                englishTranslator,
            )).not.toThrow();
    });

    test("rejects invalid payloads with the connector invalid-payload error", () => {
        expect(() =>
            validateConnectorActionInput(
                {
                    to: "not-an-email",
                },
                {
                    properties: {
                        to: {
                            format: "email",
                            type: "string",
                        },
                    },
                    required: ["to"],
                    type: "object",
                },
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
