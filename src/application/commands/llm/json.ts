import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { readJsonInputValue } from "../shared/json-input.ts";
import {
    compileJsonSchema,
    formatJsonSchemaErrors,
    validateCompiledJsonSchema,
} from "../shared/json-schema-validation.ts";
import { requestOo } from "../shared/oo-request.ts";
import {
    createLlmChatCompletionsUrl,
    defaultLlmModel,
} from "./config.ts";

const llmJsonFormatValues = ["json"] as const;
const defaultMaxRetries = 2;
const maxAllowedRetries = 5;

const llmJsonInputErrorKeys = {
    dataFilePathRequired: "errors.llmJson.inputFilePathRequired",
    dataReadFailed: "errors.llmJson.inputReadFailed",
    invalidDataJson: "errors.llmJson.invalidInputJson",
} as const;

const llmJsonSchemaErrorKeys = {
    dataFilePathRequired: "errors.llmJson.schemaFilePathRequired",
    dataReadFailed: "errors.llmJson.schemaReadFailed",
    invalidDataJson: "errors.llmJson.invalidSchemaJson",
} as const;

const chatCompletionResponseSchema = z.object({
    choices: z.array(z.object({
        message: z.object({
            content: z.string(),
        }).passthrough(),
    }).passthrough()).min(1),
}).passthrough();

interface LlmJsonInput {
    format?: (typeof llmJsonFormatValues)[number];
    input?: string;
    maxRetries?: string;
    model?: string;
    schema?: string;
    showSchemaVersion?: boolean;
    system?: string;
}

interface LlmJsonOutput {
    attempts: number;
    data: unknown;
    model: string;
    ok: true;
}

export const llmJsonCommand: CliCommandDefinition<LlmJsonInput> = {
    name: "json",
    summaryKey: "commands.llm.json.summary",
    descriptionKey: "commands.llm.json.description",
    options: [
        {
            name: "schema",
            longFlag: "--schema",
            valueName: "schema",
            descriptionKey: "options.schema",
        },
        {
            name: "system",
            longFlag: "--system",
            valueName: "system",
            descriptionKey: "options.system",
        },
        {
            name: "input",
            longFlag: "--input",
            valueName: "input",
            descriptionKey: "options.input",
        },
        {
            name: "maxRetries",
            longFlag: "--max-retries",
            valueName: "count",
            descriptionKey: "options.maxRetries",
        },
        {
            name: "model",
            longFlag: "--model",
            valueName: "model",
            descriptionKey: "options.model",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        format: z.enum(llmJsonFormatValues).optional(),
        input: z.string().optional(),
        maxRetries: z.string().optional(),
        model: z.string().optional(),
        schema: z.string().optional(),
        showSchemaVersion: z.boolean().optional(),
        system: z.string().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const schema = await readRequiredJsonSchema(input.schema, context);
        const [validator, schemaError] = compileJsonSchema(schema);

        if (schemaError !== undefined || validator === undefined) {
            throw new CliUserError("errors.llmJson.invalidSchema", 2, {
                message: schemaError?.message ?? "schema validator unavailable",
            });
        }

        const inputData = await readJsonInputValue(
            input.input,
            context,
            llmJsonInputErrorKeys,
            {},
        );
        const systemPrompt = await readOptionalTextInput(input.system, context);
        const maxRetries = parseMaxRetries(input.maxRetries);
        const model = normalizeModel(input.model);
        const result = await runStructuredJsonCompletion(
            {
                apiKey: account.apiKey,
                endpoint: account.endpoint,
                inputData,
                maxRetries,
                model,
                schema,
                systemPrompt,
                validator,
            },
            context,
        );
        const output: LlmJsonOutput = {
            attempts: result.attempts,
            data: result.data,
            model,
            ok: true,
        };

        writeJsonOutput(context.stdout, output, {
            showSchemaVersion: input.showSchemaVersion,
        });
    },
};

async function readRequiredJsonSchema(
    value: string | undefined,
    context: Pick<CliExecutionContext, "cwd">,
): Promise<unknown> {
    if (value === undefined || value.trim() === "") {
        throw new CliUserError("errors.llmJson.schemaRequired", 2);
    }

    return await readJsonInputValue(
        value,
        context,
        llmJsonSchemaErrorKeys,
        undefined,
    );
}

async function readOptionalTextInput(
    value: string | undefined,
    context: Pick<CliExecutionContext, "cwd">,
): Promise<string | undefined> {
    if (value === undefined || value.trim() === "") {
        return undefined;
    }

    if (!value.startsWith("@")) {
        return value;
    }

    const relativePath = value.slice(1);

    if (relativePath.trim() === "") {
        throw new CliUserError("errors.llmJson.systemFilePathRequired", 2);
    }

    const resolvedPath = resolve(context.cwd, relativePath);

    try {
        return await readFile(resolvedPath, "utf8");
    }
    catch (error) {
        throw new CliUserError("errors.llmJson.systemReadFailed", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: resolvedPath,
        });
    }
}

function parseMaxRetries(value: string | undefined): number {
    if (value === undefined) {
        return defaultMaxRetries;
    }

    const trimmedValue = value.trim();
    const parsedValue = Number(trimmedValue);

    if (
        trimmedValue === ""
        || !Number.isInteger(parsedValue)
        || parsedValue < 0
        || parsedValue > maxAllowedRetries
    ) {
        throw new CliUserError("errors.llmJson.invalidMaxRetries", 2, {
            max: maxAllowedRetries,
            option: "--max-retries",
            value,
        });
    }

    return parsedValue;
}

function normalizeModel(value: string | undefined): string {
    const trimmedValue = value?.trim();

    if (trimmedValue === undefined || trimmedValue === "") {
        return defaultLlmModel;
    }

    return trimmedValue;
}

async function runStructuredJsonCompletion(
    options: {
        apiKey: string;
        endpoint: string;
        inputData: unknown;
        maxRetries: number;
        model: string;
        schema: unknown;
        systemPrompt?: string;
        validator: NonNullable<ReturnType<typeof compileJsonSchema>[0]>;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<{ attempts: number; data: unknown }> {
    let previousFailure: string | undefined;

    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt += 1) {
        const content = await requestStructuredJsonCompletion(
            {
                ...options,
                previousFailure,
            },
            context,
        );
        const parsed = parseJsonContent(content);

        if (!parsed.ok) {
            previousFailure = parsed.message;
            continue;
        }

        const errors = validateCompiledJsonSchema(
            options.validator,
            parsed.value,
            context.translator.locale,
        );

        if (errors?.length === 0) {
            return {
                attempts: attempt,
                data: parsed.value,
            };
        }

        previousFailure = formatJsonSchemaErrors(errors);
    }

    throw new CliUserError("errors.llmJson.validationFailed", 1, {
        message: previousFailure ?? "unknown validation error",
    });
}

async function requestStructuredJsonCompletion(
    options: {
        apiKey: string;
        endpoint: string;
        inputData: unknown;
        model: string;
        previousFailure?: string;
        schema: unknown;
        systemPrompt?: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<string> {
    const parsed = await requestOo({
        authorization: `Bearer ${options.apiKey}`,
        context,
        errors: { scope: "llmJson" },
        headers: { Accept: "application/json" },
        host: { baseUrl: createLlmChatCompletionsUrl(options.endpoint) },
        jsonBody: createChatCompletionRequestBody(options),
        label: "LLM structured JSON completion",
        method: "POST",
        schema: chatCompletionResponseSchema,
        statusErrors: failure => createLlmJsonStatusError(failure.status),
    });

    return parsed.choices[0]!.message.content;
}

function createChatCompletionRequestBody(
    options: {
        inputData: unknown;
        model: string;
        previousFailure?: string;
        schema: unknown;
        systemPrompt?: string;
    },
): Record<string, unknown> {
    assertObjectRootResponseSchema(options.schema);

    return {
        messages: [
            {
                content: createSystemMessage(options.systemPrompt),
                role: "system",
            },
            {
                content: createUserMessage(options),
                role: "user",
            },
        ],
        model: options.model,
        response_format: {
            type: "json_object",
        },
        temperature: 0,
    };
}

function assertObjectRootResponseSchema(schema: unknown): void {
    if (!isNonObjectRootResponseSchema(schema)) {
        return;
    }

    throw new CliUserError("errors.llmJson.unsupportedRootSchema", 2);
}

function isNonObjectRootResponseSchema(schema: unknown): boolean {
    if (!isRecord(schema)) {
        return false;
    }

    const rootType = schema.type;

    if (typeof rootType === "string") {
        return rootType !== "object";
    }

    if (Array.isArray(rootType)) {
        return !rootType.includes("object");
    }

    return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSystemMessage(systemPrompt: string | undefined): string {
    const basePrompt = [
        "Return only valid JSON.",
        "Do not wrap the response in Markdown.",
        "The JSON value must satisfy the provided JSON Schema.",
    ].join(" ");

    if (systemPrompt === undefined) {
        return basePrompt;
    }

    return `${basePrompt}\n\n${systemPrompt}`;
}

function createUserMessage(
    options: {
        inputData: unknown;
        previousFailure?: string;
        schema: unknown;
    },
): string {
    const parts = [
        "Input JSON:",
        JSON.stringify(options.inputData, null, 2),
        "",
        "Response JSON Schema:",
        JSON.stringify(options.schema, null, 2),
    ];

    if (options.previousFailure !== undefined) {
        parts.push(
            "",
            "The previous response was invalid:",
            options.previousFailure,
            "",
            "Return a corrected JSON value only.",
        );
    }

    return parts.join("\n");
}

// Statuses with dedicated guidance; anything else falls through to the
// module's generic llmJson requestFailed mapping.
function createLlmJsonStatusError(status: number): CliUserError | undefined {
    switch (status) {
        case 401:
        case 403:
            return new CliUserError("errors.llmJson.authFailed", 1, { status });
        case 404:
            return new CliUserError("errors.llmJson.endpointNotFound", 1, {
                status,
            });
        case 429:
            return new CliUserError("errors.llmJson.rateLimited", 1, { status });
        default:
            return undefined;
    }
}

function parseJsonContent(
    content: string,
): { ok: true; value: unknown } | { message: string; ok: false } {
    const candidates = createJsonParseCandidates(content);
    let lastMessage = "No JSON value found in the model response.";

    for (const candidate of candidates) {
        try {
            return {
                ok: true,
                value: JSON.parse(candidate) as unknown,
            };
        }
        catch (error) {
            lastMessage = error instanceof Error ? error.message : String(error);
        }
    }

    return {
        message: lastMessage,
        ok: false,
    };
}

function createJsonParseCandidates(content: string): string[] {
    const candidates: string[] = [];
    const trimmedContent = content.trim();

    addUniqueCandidate(candidates, trimmedContent);
    addUniqueCandidate(candidates, stripMarkdownFence(trimmedContent));
    addUniqueCandidate(candidates, extractJsonValue(trimmedContent));

    return candidates;
}

function addUniqueCandidate(candidates: string[], value: string | undefined): void {
    if (value === undefined || value === "" || candidates.includes(value)) {
        return;
    }

    candidates.push(value);
}

function stripMarkdownFence(value: string): string | undefined {
    const fence = "```";

    if (!value.startsWith(fence)) {
        return undefined;
    }

    const firstLineBreak = value.indexOf("\n");
    const closingFence = value.lastIndexOf(fence);

    if (firstLineBreak === -1 || closingFence <= firstLineBreak) {
        return undefined;
    }

    return value.slice(firstLineBreak + 1, closingFence).trim();
}

function extractJsonValue(value: string): string | undefined {
    const objectStart = value.indexOf("{");
    const arrayStart = value.indexOf("[");
    const start = chooseJsonStart(objectStart, arrayStart);

    if (start === undefined) {
        return undefined;
    }

    const expectedEndStack: string[] = [];
    let inString = false;
    let escaping = false;

    for (let index = start; index < value.length; index += 1) {
        const char = value[index]!;

        if (inString) {
            if (escaping) {
                escaping = false;
            }
            else if (char === "\\") {
                escaping = true;
            }
            else if (char === "\"") {
                inString = false;
            }
            continue;
        }

        if (char === "\"") {
            inString = true;
            continue;
        }

        if (char === "{") {
            expectedEndStack.push("}");
            continue;
        }

        if (char === "[") {
            expectedEndStack.push("]");
            continue;
        }

        if (char !== "}" && char !== "]") {
            continue;
        }

        if (expectedEndStack.at(-1) !== char) {
            return undefined;
        }

        expectedEndStack.pop();

        if (expectedEndStack.length === 0) {
            return value.slice(start, index + 1).trim();
        }
    }

    return undefined;
}

function chooseJsonStart(
    objectStart: number,
    arrayStart: number,
): number | undefined {
    if (objectStart === -1) {
        return arrayStart === -1 ? undefined : arrayStart;
    }

    if (arrayStart === -1) {
        return objectStart;
    }

    return Math.min(objectStart, arrayStart);
}
