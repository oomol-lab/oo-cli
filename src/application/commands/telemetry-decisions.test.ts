import type { CliCommandDefinition } from "../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { createCliCommandTelemetryPayload } from "../telemetry/payload.ts";
import { createCliCatalog } from "./catalog.ts";

type TelemetryDecision
    = | {
        kind: "excluded";
        reason: string;
    }
    | {
        kind: "generic";
        reason: string;
    }
    | {
        kind: "properties";
        properties: readonly string[];
        reason: string;
    };

const forbiddenTelemetryDecisionProperties = [
    "$identify",
    "$set",
    "$set_once",
    "account_id",
    "account_name",
    "cwd",
    "email",
    "error_message",
    "file_name",
    "filename",
    "host",
    "hostname",
    "path",
    "stack",
    "stack_trace",
    "url",
    "url_host",
    "user_id",
    "user_name",
    "username",
] as const;

const forbiddenTelemetryDecisionPropertySuffixes = [
    "_account_id",
    "_account_name",
    "_api_key",
    "_cwd",
    "_email",
    "_error_message",
    "_file_name",
    "_filename",
    "_host",
    "_hostname",
    "_path",
    "_secret",
    "_stack",
    "_stack_trace",
    "_token",
    "_url",
    "_url_host",
    "_user_id",
    "_user_name",
    "_username",
] as const;

const commandTelemetryDecisions = {
    "auth": {
        kind: "generic",
        reason: "Command group; child commands record command-specific auth dimensions.",
    },
    "auth.login": {
        kind: "properties",
        properties: ["auth_method", "account_count_bucket"],
        reason: "Records login method and bounded saved-account count.",
    },
    "auth.logout": {
        kind: "properties",
        properties: ["account_count_bucket"],
        reason: "Records bounded saved-account count after logout.",
    },
    "auth.status": {
        kind: "properties",
        properties: ["account_count_bucket"],
        reason: "Records bounded saved-account count without account identity.",
    },
    "auth.switch": {
        kind: "properties",
        properties: ["account_count_bucket"],
        reason: "Records bounded saved-account count without account identity.",
    },
    "check-update": {
        kind: "properties",
        properties: ["version_kind", "update_available"],
        reason: "Records update availability without raw version strings.",
    },
    "cloud-task": {
        kind: "generic",
        reason: "Command group; child commands record cloud-task dimensions.",
    },
    "cloud-task.run": {
        kind: "properties",
        properties: ["block_id", "dry_run", "package_name", "package_version"],
        reason: "Records product-domain package, version, and block dimensions for usage analytics.",
    },
    "cloud-task.wait": {
        kind: "properties",
        properties: ["final_status", "polled_count_bucket"],
        reason: "Records terminal status and bounded polling count.",
    },
    "cloud-task.result": {
        kind: "properties",
        properties: ["final_status"],
        reason: "Records terminal cloud-task status.",
    },
    "cloud-task.log": {
        kind: "properties",
        properties: ["log_count_bucket"],
        reason: "Records bounded returned-log count without task logs.",
    },
    "cloud-task.list": {
        kind: "properties",
        properties: ["block_id", "package_name", "result_count_bucket"],
        reason: "Records product-domain filter dimensions and bounded result count.",
    },
    "completion": {
        kind: "properties",
        properties: ["shell"],
        reason: "Records selected shell enum.",
    },
    "config": {
        kind: "generic",
        reason: "Command group; child commands record safe config dimensions where useful.",
    },
    "config.get": {
        kind: "properties",
        properties: ["config_key"],
        reason: "Records config key enum without config value.",
    },
    "config.list": {
        kind: "generic",
        reason: "Generic command telemetry is enough; no config values are recorded.",
    },
    "config.path": {
        kind: "generic",
        reason: "Generic command telemetry is enough; no filesystem path is recorded.",
    },
    "config.set": {
        kind: "properties",
        properties: ["config_key"],
        reason: "Records config key enum without config value.",
    },
    "config.unset": {
        kind: "properties",
        properties: ["config_key"],
        reason: "Records config key enum without config value.",
    },
    "connector": {
        kind: "generic",
        reason: "Command group; child commands record connector dimensions.",
    },
    "connector.run": {
        kind: "properties",
        properties: [
            "action",
            "data_size_bucket",
            "dry_run",
            "error_code",
            "http_status",
            "service",
        ],
        reason: "Records connector product dimensions, bucketed payload size, and stable error code.",
    },
    "connector.search": {
        kind: "properties",
        properties: [
            "keyword_count_bucket",
            "query_length_bucket",
            "result_count_bucket",
        ],
        reason: "Records query and result buckets without query text.",
    },
    "connector.schema": {
        kind: "properties",
        properties: ["refresh"],
        reason: "Records whether the user requested a fresh schema lookup without service or action identity.",
    },
    "connector.schema.refresh": {
        kind: "generic",
        reason: "Generic command telemetry is enough; cached connector service and action identities are not recorded.",
    },
    "file": {
        kind: "generic",
        reason: "Command group; child commands record file dimensions where safe.",
    },
    "file.cleanup": {
        kind: "generic",
        reason: "Generic command telemetry is enough; file identities are not recorded.",
    },
    "file.download": {
        kind: "properties",
        properties: ["bytes_total_bucket", "resumed", "url_scheme"],
        reason: "Records scheme and byte bucket without URL host, path, or filename.",
    },
    "file.list": {
        kind: "generic",
        reason: "Generic command telemetry is enough; file identities are not recorded.",
    },
    "file.upload": {
        kind: "properties",
        properties: ["bytes_total_bucket", "rejected_too_large"],
        reason: "Records upload size bucket and rejection state without path or filename.",
    },
    "install": {
        kind: "properties",
        properties: [
            "force",
            "path_modified",
            "update_available",
            "version_kind",
        ],
        reason: "Records self-update state without raw version strings.",
    },
    "llm": {
        kind: "generic",
        reason: "Command group; child commands make their own credential-output decisions.",
    },
    "llm.config": {
        kind: "excluded",
        reason: "This command intentionally prints the current account API key for LLM client setup.",
    },
    "llm.json": {
        kind: "generic",
        reason: "Generic command telemetry is enough; prompts, schemas, inputs, model names, and outputs are not recorded.",
    },
    "log": {
        kind: "generic",
        reason: "Command group; log paths and log contents must not be recorded.",
    },
    "log.path": {
        kind: "generic",
        reason: "Generic command telemetry is enough; log path output is not recorded.",
    },
    "log.print": {
        kind: "generic",
        reason: "Generic command telemetry is enough; log contents are not recorded.",
    },
    "login": {
        kind: "properties",
        properties: ["auth_method", "account_count_bucket"],
        reason: "Top-level auth alias records the same safe auth dimensions as auth.login.",
    },
    "logout": {
        kind: "properties",
        properties: ["account_count_bucket"],
        reason: "Top-level auth alias records the same safe auth dimensions as auth.logout.",
    },
    "packages": {
        kind: "generic",
        reason: "Command group; child commands record package dimensions.",
    },
    "packages.info": {
        kind: "properties",
        properties: ["package_name", "package_version"],
        reason: "Records product-domain package and version dimensions for usage analytics.",
    },
    "packages.search": {
        kind: "properties",
        properties: ["query_length_bucket", "result_count_bucket"],
        reason: "Records query and result buckets without query text.",
    },
    "search": {
        kind: "properties",
        properties: [
            "keyword_count_bucket",
            "query_length_bucket",
            "result_count_bucket",
        ],
        reason: "Records query and result buckets without query text.",
    },
    "skills": {
        kind: "generic",
        reason: "Command group; child commands record skill dimensions where safe.",
    },
    "skills.init": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local skill content is not recorded.",
    },
    "skills.install": {
        kind: "properties",
        properties: [
            "bundled_skill",
            "package_kind",
            "package_name",
            "skill_ids_count_bucket",
            "skill_ids_sample",
            "skill_ids_truncated",
        ],
        reason: "Records install source, product-domain package dimension, and bounded skill samples.",
    },
    "skills.list": {
        kind: "generic",
        reason: "Generic command telemetry is enough; installed skill inventory is not recorded.",
    },
    "skills.preflight": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local paths are not recorded.",
    },
    "skills.publish": {
        kind: "properties",
        properties: [
            "force",
            "package_name",
            "skill_id",
            "source_kind",
            "visibility",
        ],
        reason: "Records publication mode plus product-domain package and skill dimensions.",
    },
    "skills.search": {
        kind: "properties",
        properties: [
            "keyword_count_bucket",
            "query_length_bucket",
            "result_count_bucket",
        ],
        reason: "Records query and result buckets without query text.",
    },
    "skills.share": {
        kind: "generic",
        reason: "Generic command telemetry is enough; generated share prompts, package names, share ids, and temporary share limits are not recorded.",
    },
    "skills.sync": {
        kind: "generic",
        reason: "Command group; sync children do not record local file paths.",
    },
    "skills.sync.apply": {
        kind: "generic",
        reason: "Generic command telemetry is enough; sync source paths are not recorded.",
    },
    "skills.sync.upload": {
        kind: "generic",
        reason: "Generic command telemetry is enough; sync source paths are not recorded.",
    },
    "skills.uninstall": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local uninstall paths are not recorded.",
    },
    "skills.update": {
        kind: "properties",
        properties: [
            "package_kind",
            "package_name",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
            "skill_ids_count_bucket",
            "skill_ids_sample",
            "skill_ids_truncated",
        ],
        reason: "Records artifact identity and bounded skill/package samples.",
    },
    "skills.validate": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local validation path is not recorded.",
    },
    "telemetry": {
        kind: "excluded",
        reason: "Telemetry control commands must not observe themselves.",
    },
    "telemetry.disable": {
        kind: "excluded",
        reason: "Disabling telemetry must not emit a farewell event.",
    },
    "telemetry.enable": {
        kind: "excluded",
        reason: "Telemetry control commands must not observe themselves.",
    },
    "telemetry.status": {
        kind: "excluded",
        reason: "Status must not change pending telemetry counts.",
    },
    "update": {
        kind: "properties",
        properties: [
            "force",
            "path_modified",
            "update_available",
            "version_kind",
        ],
        reason: "Records self-update state without raw version strings.",
    },
} as const satisfies Record<string, TelemetryDecision>;

describe("command telemetry decisions", () => {
    test("covers every registered command with an explicit telemetry decision", () => {
        const commandPaths = collectCommandPaths(createCliCatalog().commands);
        const actualPaths = commandPaths.map(command => command.path).sort();
        const decisionPaths = Object.keys(commandTelemetryDecisions).sort();

        expect(decisionPaths).toEqual(actualPaths);
    });

    test("keeps exclusion metadata aligned with telemetry decisions", () => {
        const commandPaths = collectCommandPaths(createCliCatalog().commands);

        for (const command of commandPaths) {
            const decision = commandTelemetryDecisions[command.path];

            expect(decision).toBeDefined();
            expect(command.definition.excludeFromTelemetry === true).toBe(
                decision?.kind === "excluded",
            );
        }
    });

    test("documents command-specific telemetry properties when a command needs them", () => {
        for (const [path, decision] of Object.entries(commandTelemetryDecisions)) {
            if (decision.kind !== "properties") {
                continue;
            }

            expect(
                decision.properties.length,
                `${path} should document at least one telemetry property.`,
            ).toBeGreaterThan(0);
        }
    });

    test("keeps command telemetry decision properties privacy-safe", () => {
        const baseTelemetryPropertyNames = createBaseTelemetryPropertyNames();

        for (const [path, decision] of Object.entries(commandTelemetryDecisions)) {
            if (decision.kind !== "properties") {
                continue;
            }

            for (const property of decision.properties) {
                const forbiddenReason = readForbiddenTelemetryDecisionPropertyReason(
                    property,
                    baseTelemetryPropertyNames,
                );

                expect(
                    forbiddenReason,
                    `${path} must not document unsafe telemetry property ${property}.`,
                ).toBeUndefined();
            }
        }
    });
});

function collectCommandPaths(
    commands: readonly CliCommandDefinition[],
    parentPath: readonly string[] = [],
): { definition: CliCommandDefinition; path: keyof typeof commandTelemetryDecisions }[] {
    const paths: { definition: CliCommandDefinition; path: keyof typeof commandTelemetryDecisions }[] = [];

    for (const command of commands) {
        const commandPath = [...parentPath, command.name];
        const path = commandPath.join(".") as keyof typeof commandTelemetryDecisions;

        paths.push({
            definition: command,
            path,
        });
        paths.push(...collectCommandPaths(command.children ?? [], commandPath));
    }

    return paths;
}

function readForbiddenTelemetryDecisionPropertyReason(
    property: string,
    baseTelemetryPropertyNames: ReadonlySet<string>,
): string | undefined {
    if (baseTelemetryPropertyNames.has(property)) {
        return "base telemetry property";
    }

    if (
        forbiddenTelemetryDecisionProperties.includes(
            property as typeof forbiddenTelemetryDecisionProperties[number],
        )
    ) {
        return "forbidden telemetry property";
    }

    for (const suffix of forbiddenTelemetryDecisionPropertySuffixes) {
        if (property.endsWith(suffix)) {
            return `forbidden telemetry property suffix ${suffix}`;
        }
    }

    return undefined;
}

function createBaseTelemetryPropertyNames(): ReadonlySet<string> {
    const item = createCliCommandTelemetryPayload({
        accountState: "authenticated",
        arch: "arm64",
        ciName: "github_actions",
        cliCommit: "test-commit",
        cliInstallMethod: "native",
        cliVersion: "1.0.0",
        command: {
            argCount: 1,
            commandAction: "list",
            commandFull: "config.list",
            commandGroup: "config",
            flagsCount: 1,
            outputFormat: "json",
            parseErrorKind: "unknown_option",
        },
        distinctId: "019a0cca-0000-7000-8000-000000000001",
        durationMs: 12,
        isCi: true,
        isFirstRun: false,
        isTtyStderr: false,
        isTtyStdout: false,
        lang: "en",
        os: "darwin",
        osVersion: "25.0.0",
        outcome: {
            errorKey: "errors.fileDownload.requestFailed",
            exitCode: 1,
        },
        runtimeVersion: "1.2.3",
        sessionId: "019a0ccb-1111-7222-8333-444444444444",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        uuid: "019a0ccb-408c-728a-9df9-1ef51b742b36",
    });

    return new Set(Object.keys(item.properties));
}
