import type { CliExecutionContext, InteractiveInput } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { readStdinToEnd } from "./stdin.ts";

const stdinInputMarker = "@-";

// stdin can be drained only once, so a second `@-` option in the same
// invocation must fail instead of silently parsing an empty string.
const consumedStdinInputs = new WeakSet<InteractiveInput>();

interface JsonInputErrorKeys {
    dataFilePathRequired: string;
    dataReadFailed: string;
    invalidDataJson: string;
}

/**
 * Reads a JSON option value given inline, as `@path` (relative to cwd), or as
 * `@-` (all of stdin). Use `@./-` for a file literally named `-`.
 */
export async function readJsonInputValue(
    value: string | undefined,
    context: Pick<CliExecutionContext, "cwd" | "stdin">,
    errorKeys: JsonInputErrorKeys,
    defaultValue: unknown,
): Promise<unknown> {
    if (value === undefined || value.trim() === "") {
        return defaultValue;
    }

    const rawInput = value === stdinInputMarker
        ? await readJsonInputStdin(context.stdin)
        : value.startsWith("@")
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

async function readJsonInputStdin(stdin: InteractiveInput): Promise<string> {
    if (stdin.isTTY === true) {
        throw new CliUserError("errors.shared.stdinInputTty", 2);
    }

    if (consumedStdinInputs.has(stdin)) {
        throw new CliUserError("errors.shared.stdinInputConsumed", 2);
    }

    consumedStdinInputs.add(stdin);

    return await readStdinToEnd(stdin);
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
