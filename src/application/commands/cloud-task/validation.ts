import type { ErrorObject, ValidateFunction } from "ajv";

import type { PackageInfoResponse } from "../package/shared.ts";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import ajvEN from "ajv-i18n/localize/en/index.js";
import ajvZH from "ajv-i18n/localize/zh/index.js";
import { CliUserError } from "../../contracts/cli.ts";
import { isPackageInfoInputHandleOptional } from "../package/shared.ts";
import { patchHandleSchema } from "../shared/handle-schema.ts";

const ajv = createAjv();

type WidgetType
    = "allOf"
        | "any"
        | "anyOf"
        | "array"
        | "boolean"
        | "credential"
        | "date"
        | "dir"
        | "file"
        | "integer"
        | "multiSelect"
        | "null"
        | "number"
        | "object"
        | "oneOf"
        | "save"
        | "secret"
        | "select"
        | "string"
        | "text"
        | "variable";

type PrimitiveType
    = "array"
        | "bigint"
        | "boolean"
        | "function"
        | "null"
        | "number"
        | "object"
        | "string"
        | "symbol"
        | "undefined";

type ValidationErrorCode
    = "compile"
        | "type"
        | "unsupportedContentMediaType"
        | "validation";

interface ValidationError {
    readonly code: ValidationErrorCode;
    readonly contentMediaType?: string;
    readonly message?: string;
}

interface JsonSchemaObject {
    [key: string]: unknown;
    anyOf?: unknown;
    oneOf?: unknown;
    allOf?: unknown;
    contentMediaType?: unknown;
    enum?: unknown;
    format?: unknown;
    type?: unknown;
    uniqueItems?: unknown;
}

export function validateCloudTaskInputValues(
    inputValues: Record<string, unknown>,
    block: PackageInfoResponse["blocks"][number],
    locale: string,
): void {
    const definedHandles = new Set(Object.keys(block.inputHandle));

    for (const handleName of Object.keys(inputValues)) {
        if (!definedHandles.has(handleName)) {
            throw new CliUserError("errors.cloudTaskRun.unknownInputHandle", 2, {
                blockId: block.blockName,
                handle: handleName,
            });
        }
    }

    for (const [handleName, handleDef] of Object.entries(block.inputHandle)) {
        const error = validateHandleValue(
            inputValues[handleName],
            handleDef,
            locale,
        );

        if (!error) {
            continue;
        }

        if (error.code === "unsupportedContentMediaType") {
            throw new CliUserError(
                "errors.cloudTaskRun.unsupportedContentMediaType",
                2,
                {
                    contentMediaType: error.contentMediaType ?? "",
                    handle: handleName,
                },
            );
        }

        if (error.code === "compile") {
            throw new CliUserError("errors.cloudTaskRun.invalidHandleSchema", 1, {
                handle: handleName,
                message: error.message ?? "",
            });
        }

        throw new CliUserError("errors.cloudTaskRun.invalidPayload", 2, {
            handle: handleName,
            message: error.message ?? "",
        });
    }
}

function createAjv(): Ajv {
    const instance = new Ajv({
        addUsedSchema: false,
        allErrors: true,
        strict: false,
        verbose: true,
    });

    addFormats(instance);
    instance.addFormat("hex-color", {
        type: "string",
        validate: value => isHexColorString(value),
    });

    return instance;
}

function validateHandleValue(
    value: unknown,
    def: PackageInfoResponse["blocks"][number]["inputHandle"][string],
    locale?: string,
): ValidationError | undefined {
    if (value === undefined && isPackageInfoInputHandleOptional(def)) {
        return undefined;
    }

    if (def.nullable === true && value == null) {
        return undefined;
    }

    const normalizedSchema = normalizeHandleSchema(def.schema, def.ext);

    if ("error" in normalizedSchema) {
        return normalizedSchema.error;
    }

    const [validator, compileError] = compile(normalizedSchema.schema);

    if (compileError !== undefined) {
        return {
            code: "compile",
            message: String(compileError.message ?? compileError),
        };
    }

    const schemaType = typeOfSchema(normalizedSchema.schema);
    const expectedType = asPrimitiveType(schemaType);
    const actualType = inferPrimitiveType(value);

    if (expectedType ? expectedType !== actualType : value === undefined) {
        return {
            code: "type",
            message: locale?.startsWith("zh")
                ? `期望类型为 ${expectedType ?? "任意类型"}，实际为 ${actualType ?? "未定义"}`
                : `Expected type ${expectedType ?? "any"}, but got ${actualType ?? "undefined"}`,
        };
    }

    const validationErrors = validate(validator, value, locale);

    if (validationErrors && validationErrors.length > 0) {
        return {
            code: "validation",
            message: ajv.errorsText(validationErrors),
        };
    }

    return undefined;
}

function normalizeHandleSchema(
    schema: unknown,
    ext?: Record<string, unknown>,
): { schema: unknown } | { error: ValidationError } {
    if (!isPlainObject(schema)) {
        return {
            schema: patchHandleSchema(schema, ext),
        };
    }

    const contentMediaType = schema.contentMediaType;

    if (typeof contentMediaType !== "string") {
        return {
            schema: patchHandleSchema(schema, ext),
        };
    }

    if (contentMediaType !== "oomol/secret") {
        return {
            error: {
                code: "unsupportedContentMediaType",
                contentMediaType,
            },
        };
    }

    const normalizedSchema = { ...schema };

    delete normalizedSchema.contentMediaType;

    return {
        schema: patchHandleSchema(normalizedSchema, ext),
    };
}

function compile(
    schema?: unknown,
): [ValidateFunction | undefined, Error | undefined] {
    if (schema === undefined) {
        return [undefined, undefined];
    }

    try {
        return [ajv.compile(schema as object | boolean), undefined];
    }
    catch (error) {
        return [undefined, error as Error];
    }
}

function validate(
    validator: ValidateFunction | undefined,
    data: unknown,
    locale?: string,
): ErrorObject[] | null | undefined {
    if (validator === undefined) {
        return [];
    }

    if (validator(data)) {
        return [];
    }

    if (locale?.startsWith("zh")) {
        ajvZH(validator.errors);
    }
    else {
        ajvEN(validator.errors);
    }

    return validator.errors;
}

function typeOfSchema(schema: unknown): WidgetType {
    if (!isPlainObject(schema)) {
        return "any";
    }

    switch (schema.contentMediaType) {
        case "oomol/secret":
            return "secret";
        case "oomol/credential":
            return "credential";
        case "oomol/variable":
            return "variable";
    }

    if (schema.anyOf !== undefined) {
        return "anyOf";
    }

    if (schema.oneOf !== undefined) {
        return "oneOf";
    }

    if (schema.allOf !== undefined) {
        return "allOf";
    }

    if (Array.isArray(schema.enum)) {
        return "select";
    }

    switch (schema.type) {
        case "null":
        case "boolean":
        case "integer":
        case "number":
        case "object":
            return schema.type;
        case "array":
            return schema.uniqueItems === true ? "multiSelect" : "array";
        case "string":
            return schema.format === "date-time" ? "date" : "string";
        default:
            return "any";
    }
}

function asPrimitiveType(type: WidgetType): PrimitiveType | undefined {
    switch (type) {
        case "string":
        case "text":
        case "date":
        case "file":
        case "save":
        case "dir":
        case "secret":
        case "credential":
            return "string";
        case "number":
        case "integer":
            return "number";
        case "boolean":
            return "boolean";
        case "object":
            return "object";
        case "null":
            return "null";
        case "multiSelect":
        case "array":
            return "array";
        default:
            return undefined;
    }
}

function inferPrimitiveType(value: unknown): PrimitiveType {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "array";
    }

    return typeof value;
}

function isHexColorString(value: string): boolean {
    if (!value.startsWith("#")) {
        return false;
    }

    if (value.length !== 7 && value.length !== 9) {
        return false;
    }

    for (let index = 1; index < value.length; index += 1) {
        const charCode = value.charCodeAt(index);
        const isDigit = charCode >= 48 && charCode <= 57;
        const isUpperHex = charCode >= 65 && charCode <= 70;
        const isLowerHex = charCode >= 97 && charCode <= 102;

        if (!isDigit && !isUpperHex && !isLowerHex) {
            return false;
        }
    }

    return true;
}

function isPlainObject(value: unknown): value is JsonSchemaObject {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}
