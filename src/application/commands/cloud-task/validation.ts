import type { Translator } from "../../contracts/translator.ts";
import type { PackageInfoResponse } from "../package/shared.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { isPackageInfoInputHandleOptional } from "../package/shared.ts";
import { patchHandleSchema } from "../shared/handle-schema.ts";
import {
    compileJsonSchema,
    formatJsonSchemaErrors,
    validateCompiledJsonSchema,
} from "../shared/json-schema-validation.ts";
import { isPlainObject, readWidgetName } from "../shared/schema-utils.ts";

const oomolStoragePathPrefix = "/oomol-driver/oomol-storage/";
type ValidationTranslator = Pick<Translator, "locale" | "t">;

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

interface WidgetValidationRule {
    preValidate?: (translator: ValidationTranslator) => string | undefined;
    validateValue?: (
        value: unknown,
        translator: ValidationTranslator,
    ) => string | undefined;
}

const storagePathWidgetRule: WidgetValidationRule = {
    validateValue(value, translator) {
        if (typeof value !== "string" || isOomolStoragePath(value)) {
            return undefined;
        }

        return translator.t(
            "errors.cloudTaskRun.validation.invalidStoragePath",
            {
                prefix: oomolStoragePathPrefix,
            },
        );
    },
};

const widgetValidationRules: Partial<Record<WidgetType, WidgetValidationRule>> = {
    credential: {
        preValidate(translator) {
            return translator.t(
                "errors.cloudTaskRun.validation.credentialUnsupported",
            );
        },
    },
    dir: storagePathWidgetRule,
    save: storagePathWidgetRule,
};

export function validateCloudTaskInputValues(
    inputValues: Record<string, unknown>,
    block: PackageInfoResponse["blocks"][number],
    translator: ValidationTranslator,
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
            translator,
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

function validateHandleValue(
    value: unknown,
    def: PackageInfoResponse["blocks"][number]["inputHandle"][string],
    translator: ValidationTranslator,
): ValidationError | undefined {
    const widgetRule = resolveInputWidgetRule(def.schema, def.ext);
    const preValidationMessage = widgetRule?.preValidate?.(translator);

    if (preValidationMessage !== undefined) {
        return {
            code: "validation",
            message: preValidationMessage,
        };
    }

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

    const [validator, compileError] = compileJsonSchema(normalizedSchema.schema);

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
            message: translator.t(
                "errors.cloudTaskRun.validation.expectedType",
                {
                    actualType: actualType ?? "undefined",
                    expectedType: expectedType ?? "any",
                },
            ),
        };
    }

    const widgetValidationMessage = widgetRule?.validateValue?.(
        value,
        translator,
    );

    if (widgetValidationMessage !== undefined) {
        return {
            code: "validation",
            message: widgetValidationMessage,
        };
    }

    const validationErrors = validateCompiledJsonSchema(
        validator,
        value,
        translator.locale,
    );

    if (validationErrors && validationErrors.length > 0) {
        return {
            code: "validation",
            message: formatJsonSchemaErrors(validationErrors),
        };
    }

    return undefined;
}

function readInputWidgetType(
    schema: unknown,
    ext?: Record<string, unknown>,
): WidgetType | undefined {
    const widgetName = readWidgetName(ext);

    switch (widgetName) {
        case "credential":
        case "dir":
        case "save":
            return widgetName;
    }

    const schemaType = typeOfSchema(schema);

    return schemaType === "credential" ? "credential" : undefined;
}

function resolveInputWidgetRule(
    schema: unknown,
    ext?: Record<string, unknown>,
): WidgetValidationRule | undefined {
    const widgetType = readInputWidgetType(schema, ext);

    return widgetType === undefined
        ? undefined
        : widgetValidationRules[widgetType];
}

function normalizeHandleSchema(
    schema: unknown,
    ext?: Record<string, unknown>,
): { schema: unknown } | { error: ValidationError } {
    if (!isPlainObject(schema) || typeof schema.contentMediaType !== "string") {
        return {
            schema: patchHandleSchema(schema, ext),
        };
    }

    if (schema.contentMediaType !== "oomol/secret") {
        return {
            error: {
                code: "unsupportedContentMediaType",
                contentMediaType: schema.contentMediaType,
            },
        };
    }

    const normalizedSchema = { ...schema };

    delete normalizedSchema.contentMediaType;

    return {
        schema: patchHandleSchema(normalizedSchema, ext),
    };
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

function isOomolStoragePath(value: string): boolean {
    return value.startsWith(oomolStoragePathPrefix) && !value.includes("\\");
}
