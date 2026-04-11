import type { CliExecutionContext } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { isPlainObject } from "./schema-utils.ts";

interface JsonInputErrorKeys {
    dataFilePathRequired: string;
    dataReadFailed: string;
    invalidDataJson: string;
}

export async function readJsonInputValue(
    value: string | undefined,
    context: Pick<CliExecutionContext, "cwd">,
    errorKeys: JsonInputErrorKeys,
    defaultValue: unknown,
): Promise<unknown> {
    if (value === undefined || value.trim() === "") {
        return defaultValue;
    }

    const rawInput = value.startsWith("@")
        ? await readJsonInputFile(value, context, errorKeys)
        : value;
    const normalizedInput = rawInput.charCodeAt(0) === 0xFEFF
        ? rawInput.slice(1)
        : rawInput;

    try {
        return JSON.parse(normalizedInput) as unknown;
    }
    catch (error) {
        throw new CliUserError(errorKeys.invalidDataJson, 2, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

export function requireJsonObjectInput(
    value: unknown,
    errorKey: string,
): Record<string, unknown> {
    if (!isPlainObject(value)) {
        throw new CliUserError(errorKey, 2);
    }

    return value;
}

async function readJsonInputFile(
    value: string,
    context: Pick<CliExecutionContext, "cwd">,
    errorKeys: JsonInputErrorKeys,
): Promise<string> {
    const relativePath = value.slice(1);

    if (relativePath.trim() === "") {
        throw new CliUserError(errorKeys.dataFilePathRequired, 2);
    }

    const resolvedPath = resolve(context.cwd, relativePath);

    try {
        return await readFile(resolvedPath, "utf8");
    }
    catch (error) {
        throw new CliUserError(errorKeys.dataReadFailed, 1, {
            message: error instanceof Error ? error.message : String(error),
            path: resolvedPath,
        });
    }
}
