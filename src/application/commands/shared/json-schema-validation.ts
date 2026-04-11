import type { ErrorObject, ValidateFunction } from "ajv";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import ajvEN from "ajv-i18n/localize/en/index.js";
import ajvZH from "ajv-i18n/localize/zh/index.js";
import { isPlainObject } from "./schema-utils.ts";

const ajv = createAjv();

export function compileJsonSchema(
    schema?: unknown,
): [ValidateFunction | undefined, Error | undefined] {
    if (schema === undefined) {
        return [undefined, undefined];
    }

    try {
        return [
            ajv.compile(stripSchemaDialectDeclaration(schema) as object | boolean),
            undefined,
        ];
    }
    catch (error) {
        return [undefined, error as Error];
    }
}

export function validateCompiledJsonSchema(
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

export function formatJsonSchemaErrors(
    errors: ErrorObject[] | null | undefined,
): string {
    return ajv.errorsText(errors);
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

function stripSchemaDialectDeclaration(
    value: unknown,
): unknown {
    if (Array.isArray(value)) {
        return value.map(item => stripSchemaDialectDeclaration(item));
    }

    if (!isPlainObject(value)) {
        return value;
    }

    const entries: [string, unknown][] = [];

    for (const [key, entryValue] of Object.entries(value)) {
        if (key === "$schema") {
            continue;
        }

        entries.push([key, stripSchemaDialectDeclaration(entryValue)]);
    }

    return Object.fromEntries(entries);
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
