import { describe, expect, test } from "bun:test";

import {
    compileJsonSchema,
    validateCompiledJsonSchema,
} from "./json-schema-validation.ts";

describe("json schema validation", () => {
    test("strips $schema declarations before compiling", () => {
        const schema = {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            properties: {
                messageId: {
                    type: "string",
                },
            },
            required: ["messageId"],
            type: "object",
        };
        const [validator, error] = compileJsonSchema(schema);

        expect(error).toBeUndefined();
        expect(validateCompiledJsonSchema(
            validator,
            {
                messageId: "foo",
            },
            "en",
        )).toEqual([]);
    });

    test("does not mutate the original schema while stripping $schema", () => {
        const schema = {
            properties: {
                payload: {
                    $schema: "https://json-schema.org/draft/2020-12/schema",
                    type: "string",
                },
            },
            type: "object",
        };
        const [validator, error] = compileJsonSchema(schema);

        expect(error).toBeUndefined();
        expect(validateCompiledJsonSchema(
            validator,
            {
                payload: "ok",
            },
            "en",
        )).toEqual([]);
        expect(schema.properties.payload.$schema).toBe(
            "https://json-schema.org/draft/2020-12/schema",
        );
    });
});
