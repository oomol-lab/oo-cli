import type { CliTelemetryPropertyValue } from "../contracts/cli.ts";
import type { TelemetryAgentClient } from "./agent-client.ts";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { isTelemetryAgentClient } from "./agent-client.ts";
import {
    telemetryEventName,
    telemetryMaxEventBytes,
    telemetryPostHogApiKey,
    telemetrySchemaVersion,
} from "./constants.ts";
import { isUuidV7 } from "./uuid.ts";

export type TelemetryAccountState = "anonymous" | "authenticated" | "unknown";
export type TelemetryErrorCategory
    = | "auth_error"
        | "network_error"
        | "system_error"
        | "user_error";
export type TelemetryOutputFormat = "json" | "text";
export type TelemetryPropertyValue
    = CliTelemetryPropertyValue;

export interface TelemetryCommandSnapshot {
    argCount?: number;
    commandAction?: string;
    commandFull?: string;
    commandGroup?: string;
    excludeFromTelemetry?: boolean;
    flagsCount?: number;
    outputFormat?: TelemetryOutputFormat;
    parseErrorKind?: string;
    properties?: Record<string, TelemetryPropertyValue>;
}

export interface TelemetryCommandOutcome {
    commanderCode?: string;
    errorKey?: string;
    exitCode: number;
    parseErrorKind?: string;
}

export interface CreateCliCommandTelemetryPayloadOptions {
    accountState: TelemetryAccountState;
    agentClient: TelemetryAgentClient;
    arch: string;
    cliCommit: string;
    cliInstallMethod: string;
    cliVersion: string;
    command: TelemetryCommandSnapshot;
    durationMs: number;
    isCi: boolean;
    isFirstRun: boolean;
    isTtyStderr: boolean;
    isTtyStdout: boolean;
    lang: string;
    os: string;
    osVersion: string;
    outcome: TelemetryCommandOutcome;
    runtimeVersion: string;
    sessionId: string;
    timestamp: Date;
    uuid: string;
    distinctId: string;
    ciName: string;
}

export interface TelemetryBatchItem {
    event: string;
    properties: Record<string, TelemetryPropertyValue>;
    timestamp: string;
    uuid: string;
}

const telemetryPropertyValueSchema = z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.string()),
]);
const uuidV7Schema = z.string().refine(isUuidV7);

const telemetryPropertiesSchema = z.object({
    $geoip_disable: z.literal(true),
    $ip: z.literal(""),
    $process_person_profile: z.literal(false),
    account_state: z.enum(["authenticated", "anonymous", "unknown"]),
    // Validated against the library-derived allowlist plus the two sentinel
    // values, so a dependency upgrade needs no schema change here.
    agent_client: z.string().refine(isTelemetryAgentClient),
    arch: z.string().min(1),
    arg_count: z.number().int().nonnegative(),
    ci_name: z.string().min(1),
    cli_commit: z.string().min(1),
    cli_install_method: z.enum(["bun", "native", "npm", "pnpm", "unknown", "yarn"]),
    cli_version: z.string().min(1),
    command_action: z.string().min(1),
    command_full: z.string().min(1),
    command_group: z.string().min(1),
    distinct_id: uuidV7Schema,
    duration_ms: z.number().int().nonnegative(),
    exit_code: z.number().int(),
    flags_count: z.number().int().nonnegative(),
    is_ci: z.boolean(),
    is_first_run: z.boolean(),
    is_tty_stderr: z.boolean(),
    is_tty_stdout: z.boolean(),
    lang: z.string().min(1),
    os: z.string().min(1),
    os_version: z.string().min(1),
    output_format: z.enum(["json", "text"]),
    runtime: z.literal("bun"),
    runtime_version: z.string().min(1),
    schema_version: z.literal(telemetrySchemaVersion),
    session_id: uuidV7Schema,
    success: z.boolean(),
}).catchall(telemetryPropertyValueSchema);
const forbiddenTelemetryPropertyKeys = [
    createPostHogPropertyName("identify"),
    createPostHogPropertyName("set"),
    createPostHogPropertyName(["set", "once"].join("_")),
    ["account", "id"].join("_"),
    ["account", "name"].join("_"),
    "cwd",
    "email",
    ["error", "message"].join("_"),
    ["file", "name"].join("_"),
    "filename",
    "host",
    ["host", "name"].join(""),
    "path",
    "stack",
    ["stack", "trace"].join("_"),
    "url",
    ["url", "host"].join("_"),
    ["user", "id"].join("_"),
    ["user", "name"].join("_"),
    "username",
] as const;

export const telemetryBatchItemSchema = z.object({
    event: z.literal(telemetryEventName),
    properties: telemetryPropertiesSchema,
    timestamp: z.string().datetime(),
    uuid: uuidV7Schema,
}).strict().superRefine((item, ctx) => {
    if (Object.hasOwn(item, "distinct_id")) {
        ctx.addIssue({
            code: "custom",
            message: "distinct_id must be stored in properties.",
            path: ["distinct_id"],
        });
    }

    for (const forbiddenKey of forbiddenTelemetryPropertyKeys) {
        if (Object.hasOwn(item.properties, forbiddenKey)) {
            ctx.addIssue({
                code: "custom",
                message: `${forbiddenKey} is not allowed in telemetry properties.`,
                path: ["properties", forbiddenKey],
            });
        }
    }
});

function createPostHogPropertyName(name: string): string {
    return `$${name}`;
}

export function createCliCommandTelemetryPayload(
    options: CreateCliCommandTelemetryPayloadOptions,
): TelemetryBatchItem {
    const commandGroup = options.command.commandGroup ?? "__parse__";
    const commandAction = options.command.commandAction ?? "__root__";
    const commandFull = options.command.commandFull
        ?? `${commandGroup}.${commandAction}`;
    const parseErrorKind = options.command.parseErrorKind
        ?? options.outcome.parseErrorKind;
    const properties: Record<string, TelemetryPropertyValue> = {
        $geoip_disable: true,
        $ip: "",
        $process_person_profile: false,
        account_state: options.accountState,
        agent_client: options.agentClient,
        arch: options.arch,
        arg_count: options.command.argCount ?? 0,
        ci_name: options.ciName,
        cli_commit: options.cliCommit,
        cli_install_method: options.cliInstallMethod,
        cli_version: options.cliVersion,
        command_action: commandAction,
        command_full: commandFull,
        command_group: commandGroup,
        distinct_id: options.distinctId,
        duration_ms: options.durationMs,
        exit_code: options.outcome.exitCode,
        flags_count: options.command.flagsCount ?? 0,
        is_ci: options.isCi,
        is_first_run: options.isFirstRun,
        is_tty_stderr: options.isTtyStderr,
        is_tty_stdout: options.isTtyStdout,
        lang: options.lang,
        os: options.os,
        os_version: options.osVersion,
        output_format: options.command.outputFormat ?? "text",
        runtime: "bun",
        runtime_version: options.runtimeVersion,
        schema_version: telemetrySchemaVersion,
        session_id: options.sessionId,
        success: options.outcome.exitCode === 0,
    };

    if (parseErrorKind !== undefined) {
        properties.parse_error_kind = parseErrorKind;
    }

    appendCommandSpecificProperties(properties, options.command.properties);

    const errorCategory = classifyTelemetryError(options.outcome);

    if (errorCategory !== undefined) {
        properties.error_category = errorCategory;
    }

    return telemetryBatchItemSchema.parse({
        event: telemetryEventName,
        properties,
        timestamp: options.timestamp.toISOString(),
        uuid: options.uuid,
    });
}

function appendCommandSpecificProperties(
    target: Record<string, TelemetryPropertyValue>,
    source: Record<string, TelemetryPropertyValue> | undefined,
): void {
    if (source === undefined) {
        return;
    }

    for (const [key, value] of Object.entries(source)) {
        if (Object.hasOwn(target, key)) {
            throw new TypeError(
                `Command telemetry property ${key} cannot override a base telemetry property.`,
            );
        }

        target[key] = value;
    }
}

export function serializeTelemetryBatchItem(item: TelemetryBatchItem): string | undefined {
    const parsed = telemetryBatchItemSchema.safeParse(item);

    if (!parsed.success) {
        return undefined;
    }

    const payloadJson = JSON.stringify(parsed.data);

    return Buffer.byteLength(payloadJson, "utf8") <= telemetryMaxEventBytes
        ? payloadJson
        : undefined;
}

export function parseTelemetryBatchItemJson(
    payloadJson: string,
): TelemetryBatchItem | undefined {
    try {
        const parsed = telemetryBatchItemSchema.safeParse(JSON.parse(payloadJson));

        return parsed.success ? parsed.data : undefined;
    }
    catch {
        return undefined;
    }
}

export function createTelemetryBatchRequestBody(
    items: readonly TelemetryBatchItem[],
): string {
    return JSON.stringify({
        api_key: telemetryPostHogApiKey,
        batch: items,
        historical_migration: false,
    });
}

export function classifyTelemetryError(
    outcome: TelemetryCommandOutcome,
): TelemetryErrorCategory | undefined {
    if (outcome.exitCode === 0) {
        return undefined;
    }

    const errorKey = outcome.errorKey;

    if (errorKey === undefined) {
        return "user_error";
    }

    if (
        errorKey.endsWith(".downloadError")
        || errorKey.endsWith(".downloadFailed")
        || errorKey.endsWith(".downloadStalled")
        || errorKey.endsWith(".downloadTimedOut")
        || errorKey.endsWith(".invalidResponse")
        || errorKey.endsWith(".packageDownloadError")
        || errorKey.endsWith(".packageDownloadFailed")
        || errorKey.endsWith(".packageInfoRequestError")
        || errorKey.endsWith(".packageInfoRequestFailed")
        || errorKey.endsWith(".requestError")
        || errorKey.endsWith(".requestFailed")
    ) {
        return "network_error";
    }

    if (
        errorKey === "errors.auth.noSavedAccounts"
        || errorKey === "errors.auth.required"
        || errorKey === "errors.auth.requiredConnectorOnly"
        || errorKey === "errors.auth.sessionTokenRequired"
        || errorKey === "errors.auth.loginTimeout"
    ) {
        return "auth_error";
    }

    if (
        errorKey === "errors.unexpected"
        || errorKey.startsWith("errors.authStore.")
        || errorKey.startsWith("errors.connectorStore.")
        || errorKey.startsWith("errors.store.")
        || errorKey.endsWith(".dataReadFailed")
        || errorKey.endsWith(".outDirCreateFailed")
        || errorKey.endsWith(".readFailed")
        || errorKey.endsWith(".storageConflict")
        || errorKey.endsWith(".writeFailed")
    ) {
        return "system_error";
    }

    return "user_error";
}
