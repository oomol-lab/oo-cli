import { describe, expect, test } from "bun:test";
import {
    classifyTelemetryError,
    createCliCommandTelemetryPayload,
    createTelemetryBatchRequestBody,
    parseTelemetryBatchItemJson,
    serializeTelemetryBatchItem,
} from "./payload.ts";

describe("telemetry payload", () => {
    test("renders the canonical PostHog batch shape", () => {
        const item = createCanonicalTelemetryItem();
        const request = JSON.parse(createTelemetryBatchRequestBody([item]));
        const storedItem = JSON.parse(serializeTelemetryBatchItem(item)!);
        const postHogSetPropertyName = createPostHogPropertyName("set");
        const postHogIdentifyPropertyName = createPostHogPropertyName("identify");

        expect(request).toEqual({
            api_key: "phc_AQhAZ9VYPH9JqgeMtYHc67aZedcQG2zGFTCSJAYrzB7X",
            batch: [item],
            historical_migration: false,
        });
        expect(request.batch[0]).not.toHaveProperty("distinct_id");
        expect(request.batch[0].uuid).toBe(
            "019a0ccb-408c-728a-9df9-1ef51b742b36",
        );
        expect(request.batch[0].properties.session_id).toBe(
            "019a0ccb-1111-7222-8333-444444444444",
        );
        expect(request.batch[0].properties.session_id).not.toBe(
            request.batch[0].uuid,
        );
        expect(request.batch[0].properties.distinct_id).toBe(
            "019a0cca-0000-7000-8000-000000000001",
        );
        expect(request.batch[0].properties.agent_client).toBe("claude");
        expect(request.batch[0].properties.$ip).toBe("");
        expect(request.batch[0].properties.$geoip_disable).toBe(true);
        expect(request.batch[0].properties.$process_person_profile).toBe(false);
        expect(request.batch[0].properties).not.toHaveProperty(
            postHogSetPropertyName,
        );
        expect(request.batch[0].properties).not.toHaveProperty(
            postHogIdentifyPropertyName,
        );
        expect(storedItem).not.toHaveProperty("api_key");
        expect(storedItem).not.toHaveProperty("batch");
        expect(serializeTelemetryBatchItem(item)).toBe(JSON.stringify(item));
    });

    test("rejects malformed batch items before they enter the outbox", () => {
        const item = createCanonicalTelemetryItem();
        const itemRecord = item as unknown as Record<string, unknown>;
        const properties = item.properties as Record<string, unknown>;
        const postHogSetPropertyName = createPostHogPropertyName("set");
        const postHogSetOncePropertyName = createPostHogPropertyName("set_once");

        const invalidItems = [
            removeProperty(itemRecord, "event"),
            removeProperty(itemRecord, "uuid"),
            {
                ...itemRecord,
                uuid: "not-a-uuid-v7",
            },
            {
                ...itemRecord,
                uuid: "",
            },
            removeProperty(itemRecord, "properties"),
            {
                ...itemRecord,
                distinct_id: "must-not-be-top-level",
            },
            {
                ...itemRecord,
                properties: removeProperty(properties, "distinct_id"),
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    distinct_id: "not-a-uuid-v7",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    distinct_id: "",
                },
            },
            {
                ...itemRecord,
                properties: removeProperty(properties, "$process_person_profile"),
            },
            {
                ...itemRecord,
                properties: removeProperty(properties, "$geoip_disable"),
            },
            {
                ...itemRecord,
                $ip: "",
                properties: removeProperty(properties, "$ip"),
            },
            {
                ...itemRecord,
                $geoip_disable: true,
                properties: removeProperty(properties, "$geoip_disable"),
            },
            {
                ...itemRecord,
                $process_person_profile: false,
                properties: removeProperty(properties, "$process_person_profile"),
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    $geoip_disable: false,
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    $process_person_profile: true,
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    $ip: "127.0.0.1",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    [postHogSetPropertyName]: {
                        account_id: "forbidden",
                    },
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    [postHogSetOncePropertyName]: {
                        user_id: "forbidden",
                    },
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    account_id: "forbidden",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    account_name: "forbidden",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    hostname: "forbidden",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    path: "/private/path",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    cwd: "/private/workspace",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    file_name: "secret.txt",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    filename: "secret.txt",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    url: "https://internal.example/path",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    url_host: "internal.example",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    email: "user@example.com",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    agent_client: "not-an-allowlisted-agent",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    error_message: "full error text",
                },
            },
            {
                ...itemRecord,
                properties: {
                    ...properties,
                    stack_trace: "full stack trace",
                },
            },
        ];

        for (const invalidItem of invalidItems) {
            expect(
                parseTelemetryBatchItemJson(JSON.stringify(invalidItem)),
            ).toBeUndefined();
        }
    });

    test("adds command-specific properties", () => {
        const options = createCanonicalTelemetryOptions();
        const item = createCliCommandTelemetryPayload({
            ...options,
            command: {
                ...options.command,
                properties: {
                    config_key: "lang",
                },
            },
        });

        expect(item.properties.command_full).toBe("config.list");
        expect(item.properties.distinct_id).toBe(
            "019a0cca-0000-7000-8000-000000000001",
        );
        expect(item.properties.config_key).toBe("lang");
    });

    test("rejects command-specific telemetry properties that override base properties", () => {
        const reservedProperties: Record<string, string>[] = [
            { command_full: "malicious.override" },
            { distinct_id: "019a0cca-0000-7000-8000-000000000002" },
            { schema_version: "2" },
            { agent_client: "cursor" },
        ];

        for (const properties of reservedProperties) {
            const options = createCanonicalTelemetryOptions();

            expect(() => createCliCommandTelemetryPayload({
                ...options,
                command: {
                    ...options.command,
                    properties,
                },
            })).toThrow();
        }
    });

    test("rejects forbidden command-specific telemetry properties during payload creation", () => {
        const forbiddenProperties: Record<string, string>[] = [
            { [createPostHogPropertyName("identify")]: "forbidden" },
            { [createPostHogPropertyName("set")]: "forbidden" },
            { [createPostHogPropertyName("set_once")]: "forbidden" },
            { account_id: "forbidden" },
            { account_name: "forbidden" },
            { cwd: "/private/workspace" },
            { email: "user@example.com" },
            { error_message: "full error text" },
            { file_name: "secret.txt" },
            { filename: "secret.txt" },
            { host: "internal.example" },
            { hostname: "workstation.local" },
            { path: "/private/path" },
            { stack: "full stack trace" },
            { stack_trace: "full stack trace" },
            { url: "https://internal.example/path" },
            { url_host: "internal.example" },
            { user_id: "forbidden" },
            { user_name: "forbidden" },
            { username: "forbidden" },
        ];

        for (const properties of forbiddenProperties) {
            const options = createCanonicalTelemetryOptions();

            expect(() => createCliCommandTelemetryPayload({
                ...options,
                command: {
                    ...options.command,
                    properties,
                },
            })).toThrow();
        }
    });

    test("rejects oversized event payloads before they enter the outbox", () => {
        const item = createCanonicalTelemetryItem();

        item.properties.large_value = "x".repeat(4096);

        expect(serializeTelemetryBatchItem(item)).toBeUndefined();
    });

    test("measures event size by bytes instead of string length", () => {
        const item = createCanonicalTelemetryItem();

        item.properties.large_value = "界".repeat(1400);

        expect(serializeTelemetryBatchItem(item)).toBeUndefined();
    });

    test("classifies failed command outcomes by structured error keys", () => {
        expect(classifyTelemetryError({
            errorKey: "errors.fileDownload.requestFailed",
            exitCode: 1,
        })).toBe("network_error");
        expect(classifyTelemetryError({
            errorKey: "errors.auth.required",
            exitCode: 1,
        })).toBe("auth_error");
        expect(classifyTelemetryError({
            errorKey: "errors.store.readFailed",
            exitCode: 1,
        })).toBe("system_error");
        expect(classifyTelemetryError({
            errorKey: "errors.config.invalidKey",
            exitCode: 2,
        })).toBe("user_error");
        expect(classifyTelemetryError({
            exitCode: 1,
        })).toBe("user_error");
        expect(classifyTelemetryError({
            errorKey: "errors.fileDownload.requestFailed",
            exitCode: 0,
        })).toBeUndefined();
    });
});

function createCanonicalTelemetryItem() {
    return createCliCommandTelemetryPayload(createCanonicalTelemetryOptions());
}

function createCanonicalTelemetryOptions() {
    return {
        accountState: "authenticated",
        agentClient: "claude",
        arch: "arm64",
        ciName: "none",
        cliCommit: "abcdef0",
        cliInstallMethod: "native",
        cliVersion: "1.2.3",
        command: {
            argCount: 0,
            commandAction: "list",
            commandFull: "config.list",
            commandGroup: "config",
            flagsCount: 0,
            outputFormat: "text",
        },
        distinctId: "019a0cca-0000-7000-8000-000000000001",
        durationMs: 42,
        isCi: false,
        isFirstRun: false,
        isTtyStderr: true,
        isTtyStdout: true,
        lang: "zh",
        os: "darwin",
        osVersion: "15.4.0",
        outcome: {
            exitCode: 0,
        },
        runtimeVersion: "1.2.10",
        sessionId: "019a0ccb-1111-7222-8333-444444444444",
        timestamp: new Date("2026-05-07T12:34:56.789Z"),
        uuid: "019a0ccb-408c-728a-9df9-1ef51b742b36",
    } as const;
}

function removeProperty(
    source: Record<string, unknown>,
    propertyName: string,
): Record<string, unknown> {
    const next = { ...source };

    delete next[propertyName];

    return next;
}

function createPostHogPropertyName(name: string): string {
    return `$${name}`;
}
