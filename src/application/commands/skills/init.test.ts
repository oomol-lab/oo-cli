import { lstat, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";
import { installedRegistrySkillCompatibility } from "./registry-skill-markdown.ts";
import {
    createLocalSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skills init command", () => {
    test("initializes a local skill in the requested agent skill directory", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "campaign-writer",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "Campaign Writer",
                "--agent",
                "codex",
                "--description",
                "Write campaign briefs using a known package workflow.",
                "--icon",
                ":lucide:wrench:",
                "--title",
                "Campaign Writer",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Initialized skill campaign-writer at ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(join(skillDirectoryPath, ".oo-metadata.json"), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );
            expect(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            ).toBe([
                "---",
                "name: campaign-writer",
                "description: Write campaign briefs using a known package workflow.",
                `compatibility: ${installedRegistrySkillCompatibility}`,
                "metadata:",
                "  icon: ':lucide:wrench:'",
                "  title: Campaign Writer",
                "---",
                "",
                "# Campaign Writer",
                "",
                "## When to Use",
                "",
                "TODO: Describe the user requests and outcomes that should trigger this skill.",
                "",
                "## Inputs",
                "",
                "- TODO: List required user inputs.",
                "- TODO: List optional inputs or safe defaults.",
                "",
                "## Execution",
                "",
                "TODO: Describe the exact oo connector command path, for example an authenticated connector action.",
                "",
                "## Result Handling",
                "",
                "TODO: Describe useful output fields, artifacts, previews, or saved files.",
                "",
                "## Failure Handling",
                "",
                "TODO: Describe auth, billing, missing input, unsupported shape, timeout, or action failure blockers.",
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("omits metadata title when no title is provided", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "minimal-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "minimal-skill",
                "--agent",
                "codex",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            ).toBe([
                "---",
                "name: minimal-skill",
                "description: Use a known package workflow.",
                `compatibility: ${installedRegistrySkillCompatibility}`,
                "---",
                "",
                "# Minimal Skill",
                "",
                "## When to Use",
                "",
                "TODO: Describe the user requests and outcomes that should trigger this skill.",
                "",
                "## Inputs",
                "",
                "- TODO: List required user inputs.",
                "- TODO: List optional inputs or safe defaults.",
                "",
                "## Execution",
                "",
                "TODO: Describe the exact oo connector command path, for example an authenticated connector action.",
                "",
                "## Result Handling",
                "",
                "TODO: Describe useful output fields, artifacts, previews, or saved files.",
                "",
                "## Failure Handling",
                "",
                "TODO: Describe auth, billing, missing input, unsupported shape, timeout, or action failure blockers.",
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill for CodeBuddy", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            "codebuddy-skill",
        );

        try {
            await mkdir(codeBuddyHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "codebuddy-skill",
                "--agent",
                "codebuddy",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Initialized skill codebuddy-skill at ${skillDirectoryPath}.\n`,
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill for DeepSeek TUI", async () => {
        const sandbox = await createCliSandbox();
        const deepSeekTuiHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "deepseek-tui");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            deepSeekTuiHomeDirectory,
            "deepseek-tui-skill",
        );

        try {
            await mkdir(deepSeekTuiHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "deepseek-tui-skill",
                "--agent",
                "deepseek-tui",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Initialized skill deepseek-tui-skill at ${skillDirectoryPath}.\n`,
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill for Trae", async () => {
        const sandbox = await createCliSandbox();
        const traeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            traeHomeDirectory,
            "trae-skill",
        );

        try {
            await mkdir(traeHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "trae-skill",
                "--agent",
                "trae",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Initialized skill trae-skill at ${skillDirectoryPath}.\n`,
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill for Trae CN", async () => {
        const sandbox = await createCliSandbox();
        const traeCnHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae-cn");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            traeCnHomeDirectory,
            "trae-cn-skill",
        );

        try {
            await mkdir(traeCnHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "trae-cn-skill",
                "--agent",
                "trae-cn",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Initialized skill trae-cn-skill at ${skillDirectoryPath}.\n`,
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires an agent before writing", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "missing-agent",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "missing-agent",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Missing required --agent. Choose universal, codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, qoderwork, deepseek-tui.\n",
            );
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires a description before writing", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "missing-description",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "missing-description",
                "--agent",
                "codex",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Missing required --description. Provide a concise trigger description for the generated skill.\n",
            );
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails before writing when the agent skill directory already exists", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "existing-skill",
        );

        try {
            await mkdir(skillDirectoryPath, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "existing-skill",
                "--agent",
                "codex",
                "--description",
                "Use an existing package workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe(
                `Skill name existing-skill is already used by a non-OOMOL skill at ${skillDirectoryPath}.\n`,
            );
            await expect(
                stat(join(skillDirectoryPath, "SKILL.md")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not copy a new local skill to other agents", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const codexSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "single-agent-skill",
        );
        const codeBuddySkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            "single-agent-skill",
        );

        try {
            await Promise.all([
                mkdir(codexHomeDirectory, { recursive: true }),
                mkdir(codeBuddyHomeDirectory, { recursive: true }),
            ]);

            const result = await sandbox.run([
                "skills",
                "init",
                "single-agent-skill",
                "--agent",
                "codex",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(await readFile(join(codexSkillDirectoryPath, ".oo-metadata.json"), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );
            await expect(stat(codeBuddySkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not leave a trailing hyphen after truncating the normalized name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");
        const normalizedSkillName = "a".repeat(63);
        const inputName = `${"A".repeat(63)} B`;
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            normalizedSkillName,
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                inputName,
                "--agent",
                "codex",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Initialized skill ${normalizedSkillName} at ${skillDirectoryPath}.\n`,
            );
            expect(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            ).toContain(`name: ${normalizedSkillName}\n`);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
