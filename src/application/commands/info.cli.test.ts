import { mkdir } from "node:fs/promises";
import process from "node:process";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
} from "../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import { APP_NAME } from "../config/app-config.ts";
import { JSON_OUTPUT_SCHEMA_VERSION } from "./json-output.ts";
import {
    availableBundledSkillAgentNames,
    resolveManagedSkillAgentHomeDirectory,
} from "./skills/managed-skill-agents.ts";
import { resolveManagedSkillsDirectoryPath } from "./skills/managed-skill-paths.ts";

describe("info CLI", () => {
    test("prints a JSON payload with cli, agents, and features", async () => {
        const sandbox = await createCliSandbox();

        try {
            const storePaths = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            });
            const result = await sandbox.run(["info", "--json"], {
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout);
            expect(payload).toMatchObject({
                cli: {
                    version: "1.2.3",
                    platform: process.platform,
                    arch: process.arch,
                    storeDir: storePaths.rootDirectory,
                    logDir: storePaths.logDirectoryPath,
                    authFile: storePaths.authFilePath,
                    settingsFile: storePaths.settingsFilePath,
                },
                features: [],
            });
            expect(Array.isArray(payload.agents)).toBe(true);
            expect(payload.schemaVersion).toBeUndefined();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("adds schemaVersion when --show-schema-version is set with --json", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "info",
                "--json",
                "--show-schema-version",
            ]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout);
            expect(payload.schemaVersion).toBe(JSON_OUTPUT_SCHEMA_VERSION);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports agent status based on detected home directories", async () => {
        const sandbox = await createCliSandbox();

        try {
            const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(
                sandbox.env,
                "codex",
            );
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["info", "--json"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout);
            const agents = payload.agents as ReadonlyArray<{
                id: string;
                skillDir: string;
                status: string;
            }>;
            const agentIds = agents.map(agent => agent.id);
            expect(agentIds).toEqual([...availableBundledSkillAgentNames]);

            const codexAgent = agents.find(agent => agent.id === "codex");
            expect(codexAgent).toEqual({
                id: "codex",
                skillDir: resolveManagedSkillsDirectoryPath(codexHomeDirectory),
                status: "available",
            });

            const claudeAgent = agents.find(agent => agent.id === "claude");
            expect(claudeAgent?.status).toBe("not_installed");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a human-readable view when --json is not set", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["info"], {
                version: "1.2.3",
            });
            const logDirectoryPath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).logDirectoryPath;

            expect(createCliSnapshot(result, {
                sandbox,
                stripAnsi: true,
                replacements: [
                    { placeholder: "<LOG_DIR>", value: logDirectoryPath },
                    { placeholder: "<PLATFORM>", value: process.platform },
                    { placeholder: "<ARCH>", value: process.arch },
                ],
            })).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("includes ANSI color codes when stdout supports colors", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["info"], {
                stdout: {
                    hasColors: true,
                },
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("[");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists available agents before non-available ones in text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(
                sandbox.env,
                "claude",
            );
            await mkdir(claudeHomeDirectory, { recursive: true });

            const result = await sandbox.run(["info"], { version: "1.2.3" });

            expect(result.exitCode).toBe(0);
            const agentLines = result.stdout
                .split("\n")
                .filter(line =>
                    line.includes("(available)") || line.includes("(not installed)"),
                );
            const firstNotInstalledIndex = agentLines.findIndex(line =>
                line.includes("(not installed)"),
            );
            const lastAvailableIndex
                = agentLines.map(line => line.includes("(available)"))
                    .lastIndexOf(true);

            expect(firstNotInstalledIndex).toBeGreaterThan(-1);
            expect(lastAvailableIndex).toBeGreaterThan(-1);
            expect(lastAvailableIndex).toBeLessThan(firstNotInstalledIndex);
            expect(agentLines[lastAvailableIndex]).toContain("claude");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects unsupported --format values", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["info", "--format=yaml"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("yaml");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
