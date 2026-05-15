import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";

describe("skills locate command", () => {
    test("prints the selected agent skill path", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex"),
            "agent-skill",
        );

        try {
            await writeSkillFile(skillDirectoryPath);

            const result = await sandbox.run([
                "skills",
                "locate",
                "agent-skill",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(`${skillDirectoryPath}\n`);
            expect(result.stderr).toBe("");

            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "skills.locate",
                    has_agent_filter: true,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a unique canonical registry skill path without an agent", async () => {
        const sandbox = await createCliSandbox();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "registry-skill",
        );

        try {
            await writeSkillFile(skillDirectoryPath);

            const result = await sandbox.run([
                "skills",
                "locate",
                "registry-skill",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(`${skillDirectoryPath}\n`);
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports ambiguous matches without an agent", async () => {
        const sandbox = await createCliSandbox();
        const codexSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex"),
            "shared-skill",
        );
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "shared-skill",
        );

        try {
            await Promise.all([
                writeSkillFile(codexSkillDirectoryPath),
                writeSkillFile(canonicalSkillDirectoryPath),
            ]);

            const result = await sandbox.run([
                "skills",
                "locate",
                "shared-skill",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Skill shared-skill matches multiple local paths.",
            );
            expect(result.stderr).toContain(`- codex: ${codexSkillDirectoryPath}`);
            expect(result.stderr).toContain(`- registry: ${canonicalSkillDirectoryPath}`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects path-shaped skill ids", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "locate",
                "../demo-skill",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Invalid skill id ../demo-skill. Pass a skill id to locate, or pass a path directly to oo skills publish.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects unsupported agents", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "locate",
                "demo-skill",
                "--agent",
                "unknown",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toBe(
                "Unsupported skill agent: unknown. Use codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, qoderwork, deepseek-tui.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function writeSkillFile(directoryPath: string): Promise<void> {
    await mkdir(directoryPath, { recursive: true });
    await Bun.write(
        join(directoryPath, "SKILL.md"),
        [
            "---",
            `name: ${basename(directoryPath)}`,
            "description: Use this located skill.",
            "---",
            "",
        ].join("\n"),
    );
}
