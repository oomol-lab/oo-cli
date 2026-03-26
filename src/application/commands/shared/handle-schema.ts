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

function canMergeConstraint(
    schema: JsonSchemaObject,
    constraint: JsonSchemaObject,
): boolean {
    if (
        schema.$ref !== undefined
        || schema.allOf !== undefined
        || schema.anyOf !== undefined
        || schema.not !== undefined
        || schema.oneOf !== undefined
        || schema.if !== undefined
        || schema.then !== undefined
        || schema.else !== undefined
    ) {
        return false;
    }

    return Object.entries(constraint).every(([key, value]) =>
        !Object.hasOwn(schema, key) || Object.is(schema[key], value),
    );
}

function readWidgetName(ext: unknown): string | undefined {
    if (!isPlainObject(ext) || typeof ext.widget !== "string") {
        return undefined;
    }

    return ext.widget;
}

function isPlainObject(value: unknown): value is JsonSchemaObject {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}
