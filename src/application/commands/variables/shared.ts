import type { ZodError } from "zod";
import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { performLoggedRequest } from "../shared/request.ts";
import { readStdinToEnd } from "../shared/stdin.ts";

export const MAX_VARIABLE_KEY_LENGTH = 256;
export const MAX_VARIABLE_VALUE_BYTES = 65536;

export interface Variable {
    key: string;
    value: string;
    updatedAt: string;
}

type RequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
type VariableAccount = Pick<AuthAccount, "apiKey" | "endpoint">;

// MARK: - 校验

function hasControlCharacter(value: string): boolean {
    return [...value].some((char) => {
        const code = char.charCodeAt(0);
        return code < 0x20 || code === 0x7F;
    });
}

export const variableKeySchema = z.string()
    .trim()
    .min(1)
    .max(MAX_VARIABLE_KEY_LENGTH)
    .refine(key => !key.includes("/"), "Variable key must not contain '/'")
    .refine(key => !hasControlCharacter(key), "Variable key must not contain control characters");

export const variableFormatValues = ["json"] as const;

export function mapVariablesInputError(
    error: ZodError,
    rawInput: Record<string, unknown>,
): CliUserError {
    if (error.issues.some(issue => issue.path[0] === "key")) {
        return new CliUserError("errors.variables.invalidKey", 2, {
            value: String(rawInput.key ?? ""),
        });
    }

    return createFormatInputError(rawInput);
}

// MARK: - value 来源解析（positional / --from-file / --stdin 三选一）

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

// MARK: - 请求

const variableSchema = z.object({
    key: z.string(),
    value: z.string(),
    updatedAt: z.string(),
});

const variableListSchema = z.object({
    variables: z.array(variableSchema),
});

export function createVariablesRequestUrl(endpoint: string, key?: string): URL {
    const base = `https://cli-api.${endpoint}/v1/variables`;
    return new URL(key === undefined ? base : `${base}/${encodeURIComponent(key)}`);
}

function unexpectedError(error: unknown): CliUserError {
    return new CliUserError("errors.variables.requestError", 1, {
        message: error instanceof Error ? error.message : String(error),
    });
}

function requestFailedError(status: number): CliUserError {
    return new CliUserError("errors.variables.requestFailed", 1, { status });
}

async function parseVariable(response: Response): Promise<Variable> {
    const parsed = variableSchema.safeParse(await readJson(response));
    if (!parsed.success) {
        throw new CliUserError("errors.variables.invalidResponse", 1);
    }

    return parsed.data;
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return JSON.parse(await response.text()) as unknown;
    }
    catch {
        throw new CliUserError("errors.variables.invalidResponse", 1);
    }
}

export async function listVariables(
    account: VariableAccount,
    context: RequestContext,
): Promise<Variable[]> {
    const response = await performLoggedRequest({
        context,
        createRequestFailedError: requestFailedError,
        createUnexpectedError: unexpectedError,
        init: { headers: { Authorization: account.apiKey } },
        requestLabel: "Variables list",
        requestUrl: createVariablesRequestUrl(account.endpoint),
    });

    const parsed = variableListSchema.safeParse(await readJson(response));
    if (!parsed.success) {
        throw new CliUserError("errors.variables.invalidResponse", 1);
    }

    return parsed.data.variables;
}

export async function getVariable(
    account: VariableAccount,
    key: string,
    context: RequestContext,
): Promise<Variable> {
    const response = await performLoggedRequest({
        context,
        createRequestFailedError: status => status === 404
            ? new CliUserError("errors.variables.notFound", 1, { key })
            : requestFailedError(status),
        createUnexpectedError: unexpectedError,
        init: { headers: { Authorization: account.apiKey } },
        requestLabel: "Variables get",
        requestUrl: createVariablesRequestUrl(account.endpoint, key),
    });

    return await parseVariable(response);
}

export async function putVariable(
    account: VariableAccount,
    key: string,
    value: string,
    context: RequestContext,
): Promise<Variable> {
    const response = await performLoggedRequest({
        context,
        createRequestFailedError: status => status === 409
            ? new CliUserError("errors.variables.quotaExceeded", 1)
            : requestFailedError(status),
        createUnexpectedError: unexpectedError,
        init: {
            body: JSON.stringify({ value }),
            headers: {
                "Authorization": account.apiKey,
                "Content-Type": "application/json",
            },
            method: "PUT",
        },
        requestLabel: "Variables create",
        requestUrl: createVariablesRequestUrl(account.endpoint, key),
    });

    return await parseVariable(response);
}

export async function deleteVariable(
    account: VariableAccount,
    key: string,
    context: RequestContext,
): Promise<void> {
    await performLoggedRequest({
        context,
        createRequestFailedError: requestFailedError,
        createUnexpectedError: unexpectedError,
        init: {
            headers: { Authorization: account.apiKey },
            method: "DELETE",
        },
        requestLabel: "Variables delete",
        requestUrl: createVariablesRequestUrl(account.endpoint, key),
    });
}
