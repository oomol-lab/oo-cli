import { mkdir } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { createTerminalColors } from "../../terminal-colors.ts";
import {
    resolveClaudeHomeDirectory,
    resolveCodeBuddyHomeDirectory,
    resolveCodexHomeDirectory,
    resolveHermesHomeDirectory,
    resolveOpenClawHomeDirectory,
    resolveQoderWorkHomeDirectory,
    resolveTraeCnHomeDirectory,
    resolveTraeHomeDirectory,
    resolveWorkBuddyHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { createLocalSkillMetadata, renderSkillMetadataJson } from "./skill-metadata.ts";

const managedSkillNameColor = "#59F78D";
const managedSkillSourceColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";
const bundledSkillNames = [
    "oo",
    "oo-find-skills",
    "oo-create-skill",
    "oo-publish-skill",
] as const;

describe("skills list CLI", () => {
    test("lists skills with source, package, and version details", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillsDirectoryPath = join(codexHomeDirectory, "skills");
        const alphaSkillDirectoryPath = join(skillsDirectoryPath, "alpha-skill");
        const unmanagedSkillDirectoryPath = join(skillsDirectoryPath, "custom-skill");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await mkdir(unmanagedSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 5 skills.",
                    "",
                    ...createExpectedBundledSkillLines("Codex"),
                    "alpha-skill",
                    "  Host: Codex",
                    "  Source: registry",
                    "  Package: @oomol/alpha",
                    "  Version: 1.2.3",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("excludes local skills by default and lists them with --source local", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            "campaign-writer",
        );

        try {
            await mkdir(codeBuddyHomeDirectory, { recursive: true });

            const initResult = await sandbox.run([
                "skills",
                "init",
                "Campaign Writer",
                "--agent",
                "codebuddy",
                "--description",
                "Write campaign briefs using a known package workflow.",
            ]);
            const allSourcesResult = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });
            const result = await sandbox.run(["skills", "list", "--source", "local"]);

            expect(initResult.exitCode).toBe(0);
            expect(allSourcesResult.exitCode).toBe(0);
            expect(allSourcesResult.stderr).toBe("");
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const expectedOutput = [
                "✓ Found 1 skills.",
                "",
                "campaign-writer",
                "  Host: CodeBuddy",
                "  Source: local",
                "  Package: <local>",
                "  Version: unknown",
                `  Path: ${skillDirectoryPath}`,
                "",
            ].join("\n");

            expect(allSourcesResult.stdout).not.toContain("campaign-writer");
            expect(result.stdout).toBe(expectedOutput);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("filters local skills by agent without merging same-name local entries", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const codexSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "shared-skill",
        );
        const codeBuddySkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            "shared-skill",
        );

        try {
            await Promise.all([
                writeLocalSkill(codexSkillDirectoryPath, "shared-skill"),
                writeLocalSkill(codeBuddySkillDirectoryPath, "shared-skill"),
            ]);

            const allLocalResult = await sandbox.run(["skills", "list", "--source", "local"]);
            const codexLocalResult = await sandbox.run([
                "skills",
                "list",
                "--source",
                "local",
                "--agent",
                "codex",
            ]);

            expect(allLocalResult.exitCode).toBe(0);
            expect(allLocalResult.stderr).toBe("");
            expect(allLocalResult.stdout).toBe([
                "✓ Found 2 skills.",
                "",
                "shared-skill",
                "  Host: CodeBuddy",
                "  Source: local",
                "  Package: <local>",
                "  Version: unknown",
                `  Path: ${codeBuddySkillDirectoryPath}`,
                "",
                "shared-skill",
                "  Host: Codex",
                "  Source: local",
                "  Package: <local>",
                "  Version: unknown",
                `  Path: ${codexSkillDirectoryPath}`,
                "",
            ].join("\n"));
            expect(codexLocalResult.exitCode).toBe(0);
            expect(codexLocalResult.stdout).toBe([
                "✓ Found 1 skills.",
                "",
                "shared-skill",
                "  Host: Codex",
                "  Source: local",
                "  Package: <local>",
                "  Version: unknown",
                `  Path: ${codexSkillDirectoryPath}`,
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records filter telemetry without skill inventory", async () => {
        const sandbox = await createCliSandbox();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveCodexHomeDirectory(sandbox.env),
            "telemetry-skill",
        );

        try {
            await writeLocalSkill(skillDirectoryPath, "telemetry-skill");

            const result = await sandbox.run([
                "skills",
                "list",
                "--source",
                "local",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(0);
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "skills.list",
                    has_agent_filter: true,
                    source_filter: "local",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("agent");
            expect(telemetryPayload?.properties).not.toHaveProperty("paths");
            expect(telemetryPayload?.properties).not.toHaveProperty("skillNames");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("filters listed skills by source with the short option", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "alpha-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                "# Alpha\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "list", "-s", "registry"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 1 skills.",
                    "",
                    "alpha-skill",
                    "  Host: Codex",
                    "  Source: registry",
                    "  Package: @oomol/alpha",
                    "  Version: 1.2.3",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the source filter", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "list", "--source", "unknown"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Invalid source: unknown. Use bundled, registry, or local.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a no-results message when no local skills exist", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "list", "--source", "local"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("! No skills were found.\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("treats the removed list-local command as unknown", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "list-local"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Unknown command: list-local.");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized OpenClaw bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const openClawHomeDirectory = resolveOpenClawHomeDirectory(sandbox.env);

        try {
            await mkdir(openClawHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("OpenClaw"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized QoderWork bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const qoderWorkHomeDirectory = resolveQoderWorkHomeDirectory(sandbox.env);

        try {
            await mkdir(qoderWorkHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("QoderWork"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized CodeBuddy bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);

        try {
            await mkdir(codeBuddyHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("CodeBuddy"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized WorkBuddy bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const workBuddyHomeDirectory = resolveWorkBuddyHomeDirectory(sandbox.env);

        try {
            await mkdir(workBuddyHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("WorkBuddy"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized Trae bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const traeHomeDirectory = resolveTraeHomeDirectory(sandbox.env);

        try {
            await mkdir(traeHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("Trae"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized Trae CN bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const traeCnHomeDirectory = resolveTraeCnHomeDirectory(sandbox.env);

        try {
            await mkdir(traeCnHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("Trae CN"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists startup-synchronized Hermes bundled installs when Codex is not installed", async () => {
        const sandbox = await createCliSandbox();
        const hermesHomeDirectory = resolveHermesHomeDirectory(sandbox.env);

        try {
            await mkdir(hermesHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("Hermes"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("groups identical skills installed across multiple hosts", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(claudeHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "list"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "✓ Found 4 skills.",
                    "",
                    ...createExpectedBundledSkillLines("Codex, Claude Code"),
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a no-results message when no supported host is installed", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "list"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("! No skills were found.\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders skills list output with field-specific colors", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillsDirectoryPath = join(codexHomeDirectory, "skills");
        const alphaSkillDirectoryPath = join(skillsDirectoryPath, "alpha-skill");
        const colors = createTerminalColors(true);

        try {
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "list"], {
                stdout: {
                    hasColors: true,
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                colors.bold(colors.hex(managedSkillNameColor)("alpha-skill")),
            );
            expect(result.stdout).toContain(
                `${colors.dim("Host:")} ${colors.hex(managedSkillSourceColor)("Codex")}`,
            );
            expect(result.stdout).toContain(
                `${colors.dim("Source:")} ${colors.hex(managedSkillSourceColor)("registry")}`,
            );
            expect(result.stdout).toContain(
                `${colors.dim("Package:")} ${colors.hex(managedSkillSourceColor)("@oomol/alpha")}`,
            );
            expect(result.stdout).toContain(
                `${colors.dim("Version:")} ${colors.hex(managedSkillVersionColor)("1.2.3")}`,
            );
            expect(result.stdout).not.toContain(colors.dim("Path:"));
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function createExpectedBundledSkillLines(
    hostName: string,
): string[] {
    return bundledSkillNames.flatMap(skillName => [
        skillName,
        `  Host: ${hostName}`,
        "  Source: bundled",
        "  Version: 9.9.9",
        "",
    ]);
}

async function writeLocalSkill(
    skillDirectoryPath: string,
    skillName: string,
): Promise<void> {
    await mkdir(skillDirectoryPath, { recursive: true });
    await Bun.write(
        join(skillDirectoryPath, "SKILL.md"),
        [
            "---",
            `name: ${skillName}`,
            "description: Use a local workflow.",
            "---",
            "",
        ].join("\n"),
    );
    await Bun.write(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(createLocalSkillMetadata()),
    );
}
