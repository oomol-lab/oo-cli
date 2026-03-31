import { isPlainObject, readWidgetName } from "./schema-utils.ts";

interface JsonSchemaObject {
    [key: string]: unknown;
    allOf?: unknown;
    anyOf?: unknown;
    else?: unknown;
    format?: unknown;
    if?: unknown;
    not?: unknown;
    oneOf?: unknown;
    then?: unknown;
    type?: unknown;
    $ref?: unknown;
}

export function patchHandleSchema(
    schema: unknown,
    ext: unknown,
): unknown {
    const schemaWithPatchedChildren = patchHandleSchemaChildren(schema, ext);
    const widget = readWidgetName(ext);

    switch (widget) {
        case "color":
            return constrainSchema(schemaWithPatchedChildren, {
                format: "hex-color",
                type: "string",
            });
        case "file":
            return constrainSchema(schemaWithPatchedChildren, {
                format: "uri",
                type: "string",
            });
        default:
            return schemaWithPatchedChildren;
    }
}

function patchHandleSchemaChildren(
    schema: unknown,
    ext: unknown,
): unknown {
    if (Array.isArray(schema)) {
        return schema.map((item, index) =>
            patchHandleSchema(item, Array.isArray(ext) ? ext[index] : undefined),
        );
    }

    if (!isPlainObject(schema)) {
        return schema;
    }

    const extObject = isPlainObject(ext) ? ext : undefined;

    return Object.fromEntries(
        Object.entries(schema).map(([key, value]) => [
            key,
            patchHandleSchema(value, extObject?.[key]),
        ]),
    );
}

function constrainSchema(
    schema: unknown,
    constraint: JsonSchemaObject,
): JsonSchemaObject {
    if (schema === undefined) {
        return constraint;
    }

    if (isPlainObject(schema) && canMergeConstraint(schema, constraint)) {
        return {
            ...schema,
            ...constraint,
        };
    }

    return {
        allOf: [schema, constraint],
    };
}

const compositionKeywords = ["$ref", "allOf", "anyOf", "else", "if", "not", "oneOf", "then"] as const;

function canMergeConstraint(
    schema: JsonSchemaObject,
    constraint: JsonSchemaObject,
): boolean {
    if (compositionKeywords.some(key => schema[key] !== undefined)) {
        return false;
    }

    return Object.entries(constraint).every(([key, value]) =>
        !Object.hasOwn(schema, key) || Object.is(schema[key], value),
    );
}
