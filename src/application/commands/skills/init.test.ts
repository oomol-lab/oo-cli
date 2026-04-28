import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { resolveCodexHomeDirectory } from "./bundled-skill-paths.ts";
import { resolveLocalSkillCanonicalDirectoryPath } from "./managed-skill-paths.ts";
import { renderOoPackageExecutionGuidance } from "./registry-skill-markdown.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

describe("skills init command", () => {
    test("initializes a local skill and publishes it to existing supported hosts", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "campaign-writer");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "campaign-writer",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "Campaign Writer",
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
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(
                await readFile(join(canonicalSkillDirectoryPath, ".oo-metadata.json"), "utf8"),
            ).toBe(renderSkillMetadataJson({
                icon: ":lucide:wrench:",
                version: "0.0.1",
            }));
            expect(
                await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toBe([
                "---",
                "name: campaign-writer",
                "description: \"Write campaign briefs using a known package workflow.\"",
                "metadata:",
                "  title: \"Campaign Writer\"",
                "---",
                "",
                "# Campaign Writer",
                "",
                renderOoPackageExecutionGuidance(),
                "",
                "TODO: Describe the workflow this skill should follow.",
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("omits metadata title when no title is provided", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "minimal-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "minimal-skill",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(
                await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toBe([
                "---",
                "name: minimal-skill",
                "description: \"Use a known package workflow.\"",
                "---",
                "",
                "# Minimal Skill",
                "",
                renderOoPackageExecutionGuidance(),
                "",
                "TODO: Describe the workflow this skill should follow.",
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires a description before writing", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "missing-description",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "missing-description",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Missing required --description. Provide a concise trigger description for the generated skill.\n",
            );
            await expect(
                stat(canonicalSkillDirectoryPath),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails before writing when the local canonical directory already exists", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "existing-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "existing-skill",
                "--description",
                "Use an existing package workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("already occupied");
            await expect(
                stat(join(canonicalSkillDirectoryPath, "SKILL.md")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
