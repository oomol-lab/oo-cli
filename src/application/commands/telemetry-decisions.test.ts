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
        properties: ["account_count_bucket", "has_user_filter"],
        reason: "Records bounded saved-account count and whether --user was used, without account identity.",
    },
    "check-update": {
        kind: "properties",
        properties: ["version_kind", "update_available"],
        reason: "Records update availability without raw version strings.",
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
            "identity_source",
            "service",
            "wait",
            "wait_result",
        ],
        reason: "Records connector product dimensions, bucketed payload size, async wait modes, stable error code, and identity source (personal/flag/config) without the organization name.",
    },
    "connector.proxy": {
        kind: "properties",
        properties: [
            "data_size_bucket",
            "error_code",
            "has_body",
            "http_status",
            "identity_source",
            "method",
        ],
        reason: "Records connector proxy bucketed payload size, method enum, identity source, stable error code, and HTTP status without service name, endpoint, headers, body, or organization name.",
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
    "info": {
        kind: "generic",
        reason: "Generic command telemetry is enough; environment paths and agent presence are not recorded.",
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
    "skills.adopt": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local skill paths and content are not recorded.",
    },
    "skills.init": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local skill content is not recorded.",
    },
    "skills.install": {
        kind: "properties",
        properties: [
            "agent_format",
            "bundled_skill",
            "failed_count_bucket",
            "format",
            "has_bundled_skill",
            "has_force",
            "has_out_dir",
            "has_registry_skill",
            "has_skill_filter",
            "installed_count_bucket",
            "package_kind",
            "package_name",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
            "skill_count_bucket",
            "skill_ids_count_bucket",
            "skill_ids_sample",
            "skill_ids_truncated",
        ],
        reason: "Records install source, product-domain package dimensions, bounded skill/package samples, force-flag and skill-filter usage, JSON-output result buckets, and for the --out-dir export the directory presence flag and selected agent render format (a fixed enum).",
    },
    "skills.info": {
        kind: "properties",
        properties: ["has_agent_filter", "source_filter"],
        reason: "Records filter usage without installed skill inventory.",
    },
    "skills.locate": {
        kind: "properties",
        properties: ["has_agent_filter"],
        reason: "Records locate filter usage without skill ids or local paths.",
    },
    "skills.preflight": {
        kind: "generic",
        reason: "Generic command telemetry is enough; local paths are not recorded.",
    },
    "skills.publish": {
        kind: "properties",
        properties: [
            "force",
            "source_kind",
            "visibility",
        ],
        reason: "Records publication mode without package or skill identity.",
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
        kind: "properties",
        properties: [
            "failed_count_bucket",
            "format",
            "installed_count_bucket",
            "record_count_bucket",
        ],
        reason: "Records JSON-output buckets; never records sync source paths, package names, or skill ids.",
    },
    "skills.sync.upload": {
        kind: "properties",
        properties: [
            "format",
            "has_failure",
            "ignored_count_bucket",
            "record_count_bucket",
        ],
        reason: "Records JSON-output buckets; never records sync source paths, package names, or skill ids.",
    },
    "skills.repair": {
        kind: "properties",
        properties: [
            "has_agent_filter",
            "agent_count_bucket",
            "skill_count_bucket",
            "has_bundled_source",
            "has_registry_source",
            "success_count_bucket",
            "failure_count_bucket",
        ],
        reason: "Records bucketed counts and source-kind flags; never records skill names or paths.",
    },
    "skills.check-update": {
        kind: "properties",
        properties: [
            "has_package_filter",
            "has_skill_filter",
            "package_count_bucket",
            "checked_count_bucket",
            "update_available_count_bucket",
            "repair_required_count_bucket",
            "failed_count_bucket",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
        ],
        reason: "Records bucketed counts, package- and skill-filter usage, and bounded package-name samples; never records skill names, versions, or paths.",
    },
    "skills.recommend": {
        kind: "generic",
        reason: "Command group; child commands record safe suggestion dimensions.",
    },
    "skills.recommend.plan": {
        kind: "properties",
        properties: [
            "muted",
            "install_count_bucket",
            "update_count_bucket",
            "skipped_count_bucket",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
        ],
        reason: "Records the global mute flag, bucketed install/update/skip counts, and bounded package-name samples; never records versions or paths.",
    },
    "skills.recommend.mute": {
        kind: "properties",
        properties: [
            "target_scope",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
        ],
        reason: "Records whether the global or per-package scope was used and bounded package-name samples.",
    },
    "skills.recommend.unmute": {
        kind: "properties",
        properties: [
            "target_scope",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
        ],
        reason: "Records whether the global or per-package scope was used and bounded package-name samples.",
    },
    "skills.uninstall": {
        kind: "properties",
        properties: [
            "failed_count_bucket",
            "format",
            "has_bundled_skill",
            "has_local_skill",
            "has_package_target",
            "has_registry_skill",
            "removed_count_bucket",
            "skill_count_bucket",
        ],
        reason: "Records JSON-output buckets, skill-kind flags, and whether any argument was resolved as a package; never records skill names, package names, or paths.",
    },
    "skills.update": {
        kind: "properties",
        properties: [
            "current_count_bucket",
            "failed_count_bucket",
            "format",
            "has_skill_filter",
            "package_kind",
            "package_name",
            "package_names_count_bucket",
            "package_names_sample",
            "package_names_truncated",
            "repaired_count_bucket",
            "skill_count_bucket",
            "skill_ids_count_bucket",
            "skill_ids_sample",
            "skill_ids_truncated",
            "updated_count_bucket",
        ],
        reason: "Records artifact identity, skill-filter usage, bounded skill/package samples, and JSON-output result buckets.",
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
    "uninstall": {
        kind: "properties",
        properties: [
            "has_purge",
            "installation_method",
            "item_count_bucket",
        ],
        reason: "Records purge flag, installation method, and a bucketed count of removed items; never records skill names, package names, or paths.",
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
    "variables": {
        kind: "generic",
        reason: "Command group; child commands never record variable names or values.",
    },
    "variables.list": {
        kind: "generic",
        reason: "Generic command telemetry is enough; variable names and values are not recorded.",
    },
    "variables.get": {
        kind: "generic",
        reason: "Generic command telemetry is enough; the variable name and value are not recorded.",
    },
    "variables.create": {
        kind: "generic",
        reason: "Generic command telemetry is enough; the variable name and value are not recorded.",
    },
    "variables.delete": {
        kind: "generic",
        reason: "Generic command telemetry is enough; the variable name is not recorded.",
    },
    "version": {
        kind: "generic",
        reason: "Generic command telemetry is enough; the CLI version and commit are already attached to every event via the global cli_version and cli_commit dimensions, and build time is not telemetry-relevant.",
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
