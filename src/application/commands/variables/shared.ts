import type { ZodError } from "zod";
import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { requestOo, requestOoResponse } from "../shared/oo-request.ts";
import { readStdinToEnd } from "../shared/stdin.ts";

export const MAX_VARIABLE_NAME_LENGTH = 256;
export const MAX_VARIABLE_VALUE_BYTES = 65536;

export interface Variable {
    name: string;
    value: string;
    updatedAt: string;
}

type RequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
type VariableAccount = Pick<AuthAccount, "apiKey" | "endpoint">;

// MARK: - Validation

function hasControlCharacter(value: string): boolean {
    return [...value].some((char) => {
        const code = char.charCodeAt(0);
        return code < 0x20 || code === 0x7F;
    });
}

export const variableNameSchema = z.string()
    .trim()
    .min(1)
    .max(MAX_VARIABLE_NAME_LENGTH)
    .refine(name => !name.includes("/"), "Variable name must not contain '/'")
    .refine(name => !hasControlCharacter(name), "Variable name must not contain control characters");

export const variableFormatValues = ["json"] as const;

export function mapVariablesInputError(
    error: ZodError,
    rawInput: Record<string, unknown>,
): CliUserError {
    if (error.issues.some(issue => issue.path[0] === "name")) {
        return new CliUserError("errors.variables.invalidName", 2, {
            value: String(rawInput.name ?? ""),
        });
    }

    return createFormatInputError(rawInput);
}

// MARK: - Value source resolution (exactly one of: positional / --from-file / --stdin)

export interface VariableValueSourceInput {
    value?: string;
    fromFile?: string;
    stdin?: boolean;
}

export async function resolveVariableValue(
    input: VariableValueSourceInput,
    context: Pick<CliExecutionContext, "stdin">,
): Promise<string> {
    const sourceCount = [
        input.value !== undefined,
        input.fromFile !== undefined,
        input.stdin === true,
    ].filter(Boolean).length;

    if (sourceCount !== 1) {
        throw new CliUserError("errors.variables.valueSource", 2);
    }

    let value: string;

    if (input.stdin === true) {
        if (context.stdin.isTTY === true) {
            throw new CliUserError("errors.variables.stdinTty", 2);
        }

        value = await readStdinToEnd(context.stdin);
    }
    else if (input.fromFile !== undefined) {
        try {
            value = await readFile(input.fromFile, "utf8");
        }
        catch (error) {
            throw new CliUserError("errors.variables.fromFileReadFailed", 2, {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    else {
        value = input.value ?? "";
    }

    if (Buffer.byteLength(value, "utf8") > MAX_VARIABLE_VALUE_BYTES) {
        throw new CliUserError("errors.variables.valueTooLarge", 2, {
            max: MAX_VARIABLE_VALUE_BYTES,
        });
    }

    return value;
}

// MARK: - Requests

const variableSchema = z.object({
    name: z.string(),
    value: z.string(),
    updatedAt: z.string(),
});

const variableListSchema = z.object({
    variables: z.array(variableSchema),
});

function variablePath(name?: string): string {
    return name === undefined
        ? "/v1/variables"
        : `/v1/variables/${encodeURIComponent(name)}`;
}

export async function listVariables(
    account: VariableAccount,
    context: RequestContext,
): Promise<Variable[]> {
    const parsed = await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        host: { endpoint: account.endpoint, service: "cli-api" },
        label: "Variables list",
        path: variablePath(),
        schema: variableListSchema,
    });

    return parsed.variables;
}

export async function getVariable(
    account: VariableAccount,
    name: string,
    context: RequestContext,
): Promise<Variable> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        host: { endpoint: account.endpoint, service: "cli-api" },
        label: "Variables get",
        path: variablePath(name),
        schema: variableSchema,
        statusErrors: failure => failure.status === 404
            ? new CliUserError("errors.variables.notFound", 1, { name })
            : undefined,
    });
}

export async function putVariable(
    account: VariableAccount,
    name: string,
    value: string,
    context: RequestContext,
): Promise<Variable> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        host: { endpoint: account.endpoint, service: "cli-api" },
        jsonBody: { value },
        label: "Variables create",
        method: "PUT",
        path: variablePath(name),
        schema: variableSchema,
        statusErrors: failure => failure.status === 409
            ? new CliUserError("errors.variables.quotaExceeded", 1)
            : undefined,
    });
}

export async function deleteVariable(
    account: VariableAccount,
    name: string,
    context: RequestContext,
): Promise<void> {
    await requestOoResponse({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        host: { endpoint: account.endpoint, service: "cli-api" },
        label: "Variables delete",
        method: "DELETE",
        path: variablePath(name),
    });
}
