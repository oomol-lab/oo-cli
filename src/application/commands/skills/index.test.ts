import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";

import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createInteractiveInput,
    createRegistrySkillArchiveBytes,
    createTextBuffer,
    toRequest,
    waitForOutputText,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { executeCli } from "../../bootstrap/run-cli.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { getBundledSkillSourcePath } from "./__tests__/helpers.ts";
import { bundledSkillDevelopmentVersion } from "./bundled-skill-model.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillHomeDirectory,
    resolveBundledSkillMetadataFilePath,
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
    availableBundledSkillAgentNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";
import {
    resolveLocalSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    installedRegistrySkillCompatibility,
    renderOoPackageExecutionGuidance,
} from "./registry-skill-markdown.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

describe("skills commands", () => {
    const guidance = renderOoPackageExecutionGuidance();

    test("installs all bundled skills when no skill name is provided", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");
        const createSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo-create-skill");
        const publishSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo-publish-skill");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const ooCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const findSkillsCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-find-skills",
        );
        const createSkillCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-create-skill",
        );
        const publishSkillCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-publish-skill",
        );
        const createSkillMetadataFilePath = resolveBundledSkillMetadataFilePath(
            createSkillDirectoryPath,
        );
        const publishSkillMetadataFilePath = resolveBundledSkillMetadataFilePath(
            publishSkillDirectoryPath,
        );
        const ooMetadataFilePath = resolveBundledSkillMetadataFilePath(ooSkillDirectoryPath);
        const findSkillsMetadataFilePath = resolveBundledSkillMetadataFilePath(
            findSkillsDirectoryPath,
        );
        const resultVersion = "9.9.9";

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    "Installed 4 skills to Codex.",
                    "Skills: oo, oo-find-skills, oo-create-skill, oo-publish-skill",
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            expect(await realpath(ooSkillDirectoryPath)).toBe(
                await realpath(ooCanonicalSkillDirectoryPath),
            );
            expect(await realpath(findSkillsDirectoryPath)).toBe(
                await realpath(findSkillsCanonicalSkillDirectoryPath),
            );
            expect(await realpath(createSkillDirectoryPath)).toBe(
                await realpath(createSkillCanonicalSkillDirectoryPath),
            );
            expect(await realpath(publishSkillDirectoryPath)).toBe(
                await realpath(publishSkillCanonicalSkillDirectoryPath),
            );

            for (const file of getBundledSkillFiles("oo")) {
                expect(
                    await readFile(join(ooSkillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            for (const file of getBundledSkillFiles("oo-find-skills")) {
                expect(
                    await readFile(join(findSkillsDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            for (const file of getBundledSkillFiles("oo-create-skill")) {
                expect(
                    await readFile(join(createSkillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            for (const file of getBundledSkillFiles("oo-publish-skill")) {
                expect(
                    await readFile(join(publishSkillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            expect(await readFile(ooMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
            expect(await readFile(findSkillsMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
            expect(await readFile(createSkillMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
            expect(await readFile(publishSkillMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("colors compact bundled install summaries when stdout supports colors", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install"], {
                stdout: {
                    hasColors: true,
                },
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(stripVTControlCharacters(result.stdout)).toBe(
                "Installed 4 skills to Codex.\nSkills: oo, oo-find-skills, oo-create-skill, oo-publish-skill\n",
            );
            expect(result.stdout).toContain("\u001B[32mInstalled\u001B[39m");
            expect(result.stdout).toContain("\u001B[36mCodex\u001B[39m");
            expect(result.stdout).toContain("\u001B[36moo\u001B[39m");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a bundled skill by explicit name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const resultVersion = "9.9.9";

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("explicit bundled skill install overwrites a managed development-version installation", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const resultVersion = "9.9.9";
        const expectedSkillContent = await Bun.file(
            getBundledSkillSourcePath("oo", "SKILL.md"),
        ).text();

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({
                    version: bundledSkillDevelopmentVersion,
                }),
            );
            await Bun.write(skillFilePath, "stale\n");

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                expectedSkillContent,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs the oo-find-skills bundled skill by explicit name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-find-skills",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const resultVersion = "9.9.9";

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo-find-skills"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo-find-skills to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs the oo-publish-skill bundled skill by explicit name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo-publish-skill");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-publish-skill",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const resultVersion = "9.9.9";

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo-publish-skill"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo-publish-skill to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails when no supported bundled skill host is installed", async () => {
        const sandbox = await createCliSandbox();
        const expectedHomeDirectories = availableBundledSkillAgentNames
            .map(agentName => resolveBundledSkillHomeDirectory(sandbox.env, agentName))
            .join(", ");

        try {
            const result = await sandbox.run(["skills", "install"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `No supported skill host is installed. Expected one of: ${expectedHomeDirectories}.\n`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into both Codex and Claude Code when both homes exist", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const codexOoSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const claudeOoSkillDirectoryPath = join(claudeHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const codexCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "codex",
        );
        const claudeCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "claude",
        );

        try {
            await Promise.all([
                mkdir(codexHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Codex, Claude Code.\n",
            );
            expect(await realpath(codexOoSkillDirectoryPath)).toBe(
                await realpath(codexCanonicalSkillDirectoryPath),
            );
            expect(await realpath(claudeOoSkillDirectoryPath)).toBe(
                await realpath(claudeCanonicalSkillDirectoryPath),
            );

            for (const file of getBundledSkillFiles("oo", "codex")) {
                expect(
                    await readFile(
                        join(codexOoSkillDirectoryPath, file.relativePath),
                        "utf8",
                    ),
                ).toBe(await Bun.file(file.sourcePath).text());
            }

            for (const file of getBundledSkillFiles("oo", "claude")) {
                expect(
                    await readFile(
                        join(claudeOoSkillDirectoryPath, file.relativePath),
                        "utf8",
                    ),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into Claude Code when only Claude Code is installed", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(claudeHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "claude",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into Hermes using the Claude skill template", async () => {
        const sandbox = await createCliSandbox();
        const hermesHomeDirectory = resolveHermesHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(hermesHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "hermes",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const hermesSkillFile = getBundledSkillFiles("oo", "hermes")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (hermesSkillFile === undefined) {
                throw new Error("Missing Hermes oo SKILL.md fixture");
            }

            await mkdir(hermesHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            const installedSkillMarkdown = await readFile(skillFilePath, "utf8");

            expect(installedSkillMarkdown).toBe(
                await Bun.file(hermesSkillFile.sourcePath).text(),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into OpenClaw when only OpenClaw is installed", async () => {
        const sandbox = await createCliSandbox();
        const openClawHomeDirectory = resolveOpenClawHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(openClawHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "openclaw",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);

        try {
            await mkdir(openClawHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into QoderWork without Claude allowed tools", async () => {
        const sandbox = await createCliSandbox();
        const qoderWorkHomeDirectory = resolveQoderWorkHomeDirectory(sandbox.env);
        const qoderWorkSkillsDirectoryPath = join(qoderWorkHomeDirectory, "skills");
        const skillDirectoryPath = join(qoderWorkHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "qoderwork",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const qoderWorkSkillFile = getBundledSkillFiles("oo", "qoderwork")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (qoderWorkSkillFile === undefined) {
                throw new Error("Missing QoderWork oo SKILL.md fixture");
            }

            await mkdir(qoderWorkHomeDirectory, { recursive: true });
            await expect(stat(qoderWorkSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect((await stat(qoderWorkSkillsDirectoryPath)).isDirectory()).toBeTrue();
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            const installedSkillMarkdown = await readFile(skillFilePath, "utf8");

            expect(installedSkillMarkdown).toBe(
                await Bun.file(qoderWorkSkillFile.sourcePath).text(),
            );
            expect(installedSkillMarkdown).not.toContain("allowed-tools");
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into CodeBuddy", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codeBuddyHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "codebuddy",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const codeBuddySkillFile = getBundledSkillFiles("oo", "codebuddy")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (codeBuddySkillFile === undefined) {
                throw new Error("Missing CodeBuddy oo SKILL.md fixture");
            }

            await mkdir(codeBuddyHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await Bun.file(codeBuddySkillFile.sourcePath).text(),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into WorkBuddy", async () => {
        const sandbox = await createCliSandbox();
        const workBuddyHomeDirectory = resolveWorkBuddyHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(workBuddyHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "workbuddy",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const workBuddySkillFile = getBundledSkillFiles("oo", "workbuddy")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (workBuddySkillFile === undefined) {
                throw new Error("Missing WorkBuddy oo SKILL.md fixture");
            }

            await mkdir(workBuddyHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await Bun.file(workBuddySkillFile.sourcePath).text(),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into Trae using the CodeBuddy skill template", async () => {
        const sandbox = await createCliSandbox();
        const traeHomeDirectory = resolveTraeHomeDirectory(sandbox.env);
        const traeSkillsDirectoryPath = join(traeHomeDirectory, "skills");
        const skillDirectoryPath = join(traeHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "trae",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const traeSkillFile = getBundledSkillFiles("oo", "trae")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (traeSkillFile === undefined) {
                throw new Error("Missing Trae oo SKILL.md fixture");
            }

            await mkdir(traeHomeDirectory, { recursive: true });
            await expect(stat(traeSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect((await stat(traeSkillsDirectoryPath)).isDirectory()).toBeTrue();
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await Bun.file(traeSkillFile.sourcePath).text(),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into Trae CN using the CodeBuddy skill template", async () => {
        const sandbox = await createCliSandbox();
        const traeCnHomeDirectory = resolveTraeCnHomeDirectory(sandbox.env);
        const traeCnSkillsDirectoryPath = join(traeCnHomeDirectory, "skills");
        const skillDirectoryPath = join(traeCnHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "trae-cn",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const traeCnSkillFile = getBundledSkillFiles("oo", "trae-cn")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (traeCnSkillFile === undefined) {
                throw new Error("Missing Trae CN oo SKILL.md fixture");
            }

            await mkdir(traeCnHomeDirectory, { recursive: true });
            await expect(stat(traeCnSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect((await stat(traeCnSkillsDirectoryPath)).isDirectory()).toBeTrue();
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await Bun.file(traeCnSkillFile.sourcePath).text(),
            );
            await expect(
                stat(join(skillDirectoryPath, "agents", "openai.yaml")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("refuses to overwrite an existing non-OOMOL skill with the same name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                ownershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "install"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Skill name oo is already used by a non-OOMOL skill at ${skillDirectoryPath}.\n`,
            );
            expect(await readFile(ownershipFilePath, "utf8")).not.toContain("OOMOL");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("refuses to install when the canonical bundled skill storage is occupied by unmanaged content", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const ownershipFilePath = join(
            canonicalSkillDirectoryPath,
            "agents",
            "openai.yaml",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(
                ownershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "install"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Bundled skill storage for oo is already occupied by non-OOMOL content at ${canonicalSkillDirectoryPath}.\n`,
            );
            expect(await readFile(ownershipFilePath, "utf8")).not.toContain("OOMOL");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls all bundled skills from the Codex skills directory when no skill name is provided", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");
        const createSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo-create-skill");
        const publishSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo-publish-skill");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const ooCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const findSkillsCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-find-skills",
        );
        const createSkillCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-create-skill",
        );
        const publishSkillCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo-publish-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const installResult = await sandbox.run(["skills", "install"]);
            expect(installResult.exitCode).toBe(0);

            const result = await sandbox.run(["skills", "uninstall"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill oo from ${ooSkillDirectoryPath}.`,
                    `Removed skill oo-find-skills from ${findSkillsDirectoryPath}.`,
                    `Removed skill oo-create-skill from ${createSkillDirectoryPath}.`,
                    `Removed skill oo-publish-skill from ${publishSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            await expect(stat(ooSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(findSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(createSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(publishSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(ooCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(findSkillsCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(createSkillCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(publishSkillCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls a published skill from every existing supported host", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const hermesHomeDirectory = resolveHermesHomeDirectory(sandbox.env);
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const workBuddyHomeDirectory = resolveWorkBuddyHomeDirectory(sandbox.env);
        const traeHomeDirectory = resolveTraeHomeDirectory(sandbox.env);
        const traeCnHomeDirectory = resolveTraeCnHomeDirectory(sandbox.env);
        const openClawHomeDirectory = resolveOpenClawHomeDirectory(sandbox.env);
        const qoderWorkHomeDirectory = resolveQoderWorkHomeDirectory(sandbox.env);
        const codexSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
        const hermesSkillDirectoryPath = join(hermesHomeDirectory, "skills", "chatgpt");
        const codeBuddySkillDirectoryPath = join(codeBuddyHomeDirectory, "skills", "chatgpt");
        const workBuddySkillDirectoryPath = join(workBuddyHomeDirectory, "skills", "chatgpt");
        const traeSkillDirectoryPath = join(traeHomeDirectory, "skills", "chatgpt");
        const traeCnSkillDirectoryPath = join(traeCnHomeDirectory, "skills", "chatgpt");
        const openClawSkillDirectoryPath = join(openClawHomeDirectory, "skills", "chatgpt");
        const qoderWorkSkillDirectoryPath = join(qoderWorkHomeDirectory, "skills", "chatgpt");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            for (const skillDirectoryPath of [
                codexSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
            ]) {
                await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            }
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            for (const skillDirectoryPath of [
                codexSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
            ]) {
                await Bun.write(
                    resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                    renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
                );
                await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            }
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");

            const result = await sandbox.run(["skills", "uninstall", "chatgpt"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill chatgpt from ${codexSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${claudeSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${hermesSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${codeBuddySkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${workBuddySkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${traeSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${traeCnSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${openClawSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${qoderWorkSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            for (const skillDirectoryPath of [
                codexSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
            ]) {
                await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                    code: "ENOENT",
                });
            }
            await expect(stat(canonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls matching local and registry skills with the same name", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "shared-skill";
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", skillName);
        const codeBuddySkillDirectoryPath = join(codeBuddyHomeDirectory, "skills", skillName);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const localCanonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            skillName,
        );
        const registryCanonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            skillName,
        );
        const localSkillContent = [
            "---",
            `name: ${skillName}`,
            "description: Local workflow",
            "---",
            "",
            "# Shared Skill",
            "",
        ].join("\n");

        try {
            await Promise.all([
                mkdir(claudeSkillDirectoryPath, { recursive: true }),
                mkdir(codeBuddySkillDirectoryPath, { recursive: true }),
                mkdir(localCanonicalSkillDirectoryPath, { recursive: true }),
                mkdir(registryCanonicalSkillDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(claudeSkillDirectoryPath),
                renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
            );
            await Bun.write(join(claudeSkillDirectoryPath, "SKILL.md"), "# Registry\n");
            await Bun.write(join(registryCanonicalSkillDirectoryPath, "SKILL.md"), "# Registry\n");
            await Bun.write(join(localCanonicalSkillDirectoryPath, "SKILL.md"), localSkillContent);
            await Bun.write(join(codeBuddySkillDirectoryPath, "SKILL.md"), localSkillContent);

            const result = await sandbox.run(["skills", "remove", skillName]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill ${skillName} from ${claudeSkillDirectoryPath}.`,
                    `Removed skill ${skillName} from ${codeBuddySkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            await expect(stat(claudeSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(codeBuddySkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(localCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(registryCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls registry before local when both match the same host path", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "same-target";
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", skillName);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const localCanonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            skillName,
        );
        const registryCanonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            skillName,
        );
        const skillContent = [
            "---",
            `name: ${skillName}`,
            "description: Shared workflow",
            "---",
            "",
            "# Same Target",
            "",
        ].join("\n");

        try {
            await Promise.all([
                mkdir(skillDirectoryPath, { recursive: true }),
                mkdir(localCanonicalSkillDirectoryPath, { recursive: true }),
                mkdir(registryCanonicalSkillDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
            );
            await Bun.write(join(skillDirectoryPath, "SKILL.md"), skillContent);
            await Bun.write(join(localCanonicalSkillDirectoryPath, "SKILL.md"), skillContent);
            await Bun.write(join(registryCanonicalSkillDirectoryPath, "SKILL.md"), skillContent);

            const result = await sandbox.run(["skills", "remove", skillName]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill ${skillName} from ${skillDirectoryPath}.`,
                    `Removed skill ${skillName} from ${localCanonicalSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(localCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(registryCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not uninstall a local copy when the skill files differ", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "local-copy";
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codeBuddyHomeDirectory, "skills", skillName);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const localCanonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            skillName,
        );

        try {
            await Promise.all([
                mkdir(skillDirectoryPath, { recursive: true }),
                mkdir(localCanonicalSkillDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(
                join(localCanonicalSkillDirectoryPath, "SKILL.md"),
                "# Canonical\n",
            );
            await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# Custom\n");

            const result = await sandbox.run(["skills", "remove", skillName]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `${skillName} is not managed by oo and cannot be removed.\n`,
            );
            await expect(stat(skillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
            await expect(stat(localCanonicalSkillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects uninstall when the skill path escapes the local skills directory", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const escapedSkillDirectoryPath = join(
            codexHomeDirectory,
            "skills",
            "../../outside",
        );
        const escapedCanonicalSkillDirectoryPath = join(
            storePaths.settingsFilePath,
            "..",
            "skills",
            "../../outside",
        );
        const installedSentinelPath = join(escapedSkillDirectoryPath, "sentinel.txt");
        const canonicalSentinelPath = join(
            escapedCanonicalSkillDirectoryPath,
            "sentinel.txt",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(escapedSkillDirectoryPath, { recursive: true });
            await mkdir(escapedCanonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(
                resolveManagedSkillMetadataFilePath(escapedSkillDirectoryPath),
                renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
            );
            await Bun.write(installedSentinelPath, "installed\n");
            await Bun.write(canonicalSentinelPath, "canonical\n");

            const result = await sandbox.run(["skills", "uninstall", "../../outside"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Skill name ../../outside resolves outside the local skill directories.\n",
            );
            await expect(stat(installedSentinelPath)).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
            await expect(stat(canonicalSentinelPath)).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports skills remove as an alias for uninstall", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");
        const createSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo-create-skill");
        const publishSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo-publish-skill");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "remove"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill oo from ${ooSkillDirectoryPath}.`,
                    `Removed skill oo-find-skills from ${findSkillsDirectoryPath}.`,
                    `Removed skill oo-create-skill from ${createSkillDirectoryPath}.`,
                    `Removed skill oo-publish-skill from ${publishSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            await expect(stat(ooSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(findSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(createSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(publishSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not uninstall a same-name skill without oo metadata", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                ownershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "uninstall", "oo"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "oo is not managed by oo and cannot be removed.\n",
            );
            await expect(stat(skillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls bundled skills from both Codex and Claude Code when both homes exist", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const codexSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "oo");

        try {
            await Promise.all([
                mkdir(codexHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "uninstall", "oo"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill oo from ${codexSkillDirectoryPath}.`,
                    `Removed skill oo from ${claudeSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            await expect(stat(codexSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(claudeSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls bundled skills from OpenClaw when only OpenClaw exists", async () => {
        const sandbox = await createCliSandbox();
        const openClawHomeDirectory = resolveOpenClawHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(openClawHomeDirectory, "skills", "oo");

        try {
            await mkdir(openClawHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "uninstall", "oo"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed skill oo from ${skillDirectoryPath}.\n`,
            );
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not uninstall a published skill without oo metadata", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# ChatGPT\n");

            const result = await sandbox.run(["skills", "uninstall", "chatgpt"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "chatgpt is not managed by oo and cannot be removed.\n",
            );
            await expect(stat(skillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports an unmanaged existing skill directory clearly", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", ".system");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });

            const result = await sandbox.run(["skills", "remove", ".system"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                ".system is not managed by oo and cannot be removed.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstall removes canonical bundled skill storage even when it contains unmanaged content", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const canonicalOwnershipFilePath = join(
            canonicalSkillDirectoryPath,
            "agents",
            "openai.yaml",
        );

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            await Bun.write(ownershipFilePath, "# OOMOL\n");
            await Bun.write(
                canonicalOwnershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "uninstall", "oo"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed skill oo from ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(canonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a published registry skill by explicit --skill name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
        const requests: Request[] = [];

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai", "--skill", "chatgpt"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.3.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": [
                                    "# ChatGPT",
                                    "",
                                    "Use `oo::self::chat` for the remote workflow.",
                                    "",
                                ].join("\n"),
                                "package/package/skills/chatgpt/agents/openai.yaml": [
                                    "interface:",
                                    "  display_name: ChatGPT",
                                    "",
                                    "policy:",
                                    "  allow_implicit_invocation: true",
                                    "",
                                ].join("\n"),
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Installed skill chatgpt to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect(await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                [
                    "---",
                    "name: chatgpt",
                    "description: \"Chat with a model\"",
                    `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
                    "metadata:",
                    "  title: \"ChatGPT\"",
                    "---",
                    "",
                    "# ChatGPT",
                    "",
                    guidance,
                    "",
                    "Use `oo::openai::chat` for the remote workflow.",
                    "",
                ].join("\n"),
            );
            expect(await readFile(join(skillDirectoryPath, "agents", "openai.yaml"), "utf8")).toBe(
                [
                    "interface:",
                    "  display_name: ChatGPT",
                    "",
                    "policy:",
                    "  allow_implicit_invocation: true",
                    "",
                ].join("\n"),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
            );
            expect(requests).toHaveLength(2);
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
            expect(requests[1]!.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a published registry skill into every existing supported host", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const hermesHomeDirectory = resolveHermesHomeDirectory(sandbox.env);
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const workBuddyHomeDirectory = resolveWorkBuddyHomeDirectory(sandbox.env);
        const traeHomeDirectory = resolveTraeHomeDirectory(sandbox.env);
        const traeCnHomeDirectory = resolveTraeCnHomeDirectory(sandbox.env);
        const openClawHomeDirectory = resolveOpenClawHomeDirectory(sandbox.env);
        const qoderWorkHomeDirectory = resolveQoderWorkHomeDirectory(sandbox.env);
        const codexSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
        const hermesSkillDirectoryPath = join(hermesHomeDirectory, "skills", "chatgpt");
        const codeBuddySkillDirectoryPath = join(codeBuddyHomeDirectory, "skills", "chatgpt");
        const workBuddySkillDirectoryPath = join(workBuddyHomeDirectory, "skills", "chatgpt");
        const traeSkillDirectoryPath = join(traeHomeDirectory, "skills", "chatgpt");
        const traeCnSkillDirectoryPath = join(traeCnHomeDirectory, "skills", "chatgpt");
        const openClawSkillDirectoryPath = join(openClawHomeDirectory, "skills", "chatgpt");
        const qoderWorkSkillDirectoryPath = join(qoderWorkHomeDirectory, "skills", "chatgpt");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await Promise.all([
                mkdir(codexHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
                mkdir(hermesHomeDirectory, { recursive: true }),
                mkdir(codeBuddyHomeDirectory, { recursive: true }),
                mkdir(workBuddyHomeDirectory, { recursive: true }),
                mkdir(traeHomeDirectory, { recursive: true }),
                mkdir(traeCnHomeDirectory, { recursive: true }),
                mkdir(openClawHomeDirectory, { recursive: true }),
                mkdir(qoderWorkHomeDirectory, { recursive: true }),
            ]);
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai", "--skill", "chatgpt"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.3.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                "Installed skill chatgpt to 9 agents: Codex, Claude Code, Hermes, CodeBuddy, WorkBuddy, Trae, Trae CN, OpenClaw, QoderWork.\n",
            );
            const canonicalSkillRealPath = await realpath(canonicalSkillDirectoryPath);

            for (const linkedSkillDirectoryPath of [
                codexSkillDirectoryPath,
                claudeSkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
            ]) {
                expect(await realpath(linkedSkillDirectoryPath)).toBe(
                    canonicalSkillRealPath,
                );
            }

            for (const copiedSkillDirectoryPath of [
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                openClawSkillDirectoryPath,
            ]) {
                expect(await realpath(copiedSkillDirectoryPath)).not.toBe(
                    canonicalSkillRealPath,
                );
                expect((await lstat(copiedSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
            }
            for (const skillDirectoryPath of [
                codexSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
            ]) {
                expect(await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                    "# ChatGPT",
                );
                expect(await readFile(
                    resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                    "utf8",
                )).toBe(
                    renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
                );
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a published registry skill when only Claude Code is installed", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai", "--skill", "chatgpt"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.3.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Installed skill chatgpt to ${skillDirectoryPath}.\n`,
            );
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not install a published registry skill over an unmanaged host target", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const codexSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");

        try {
            await Promise.all([
                mkdir(codexHomeDirectory, { recursive: true }),
                mkdir(claudeSkillDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(join(claudeSkillDirectoryPath, "SKILL.md"), "# Existing\n");
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("Skill: chatgpt\n");
            expect(result.stderr).toBe(
                `Skill name chatgpt is already used by a non-OOMOL skill at ${claudeSkillDirectoryPath}.\n`,
            );
            expect(await readFile(join(claudeSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "# Existing\n",
            );
            await expect(stat(codexSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects published registry skills that escape the local skills directory", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const requests: Request[] = [];

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Escapes the skills root",
                                        name: "../../outside",
                                        title: "Outside",
                                    },
                                ],
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("Skill: ../../outside\n");
            expect(result.stderr).toBe(
                "Skill name ../../outside resolves outside the local skill directories.\n",
            );
            expect(requests).toHaveLength(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs selected published skills through the interactive picker", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const selectedSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const unselectedSkillDirectoryPath = join(codexHomeDirectory, "skills", "vision");
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            const execution = executeCli({
                argv: ["skills", "install", "openai"],
                cwd: sandbox.cwd,
                env: sandbox.env,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    if (request.url.includes("/package-info/")) {
                        return new Response(JSON.stringify({
                            packageName: "openai",
                            version: "0.0.3",
                            skills: [
                                {
                                    description: "Chat with a model",
                                    name: "chatgpt",
                                    title: "ChatGPT",
                                },
                                {
                                    description: "See images",
                                    name: "vision",
                                    title: "Vision",
                                },
                            ],
                        }));
                    }

                    if (request.url.endsWith("/openai/-/meta/openai-0.0.3.tgz")) {
                        return new Response(await createRegistrySkillArchiveBytes({
                            "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                            "package/package/skills/vision/SKILL.md": "# Vision\n",
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
                stdin,
                stderr: stderr.writer,
                stdout: stdout.writer,
                systemLocale: "en-US",
            });

            await waitForOutputText(
                stdout,
                "Select skills to install or keep installed",
            );
            stdin.feed(" ");
            stdin.feed("\r");

            const exitCode = await execution;
            const plainOutput = stripVTControlCharacters(stdout.read()).replaceAll(
                "\u200B",
                "",
            );

            expect(exitCode).toBe(0);
            expect(stderr.read()).toBe("");
            expect(plainOutput).toContain(
                "Select skills to install or keep installed",
            );
            expect(plainOutput).toContain(
                "◆ Select skills to install or keep installed",
            );
            expect(plainOutput).toContain("chatgpt");
            expect(plainOutput).toContain("vision");
            expect(plainOutput).toContain("Installing selected skills...");
            expect(plainOutput).toContain("◆ Installed");
            expect(plainOutput).toContain("  chatgpt");
            expect(plainOutput).not.toContain(
                `Installed skill chatgpt to ${selectedSkillDirectoryPath}.`,
            );
            await expect(stat(join(selectedSkillDirectoryPath, "SKILL.md"))).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
            await expect(stat(unselectedSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls deselected published skills through the interactive picker", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const installedSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await mkdir(join(installedSkillDirectoryPath, "agents"), { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
                renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }),
            );
            await Bun.write(join(installedSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");

            const execution = executeCli({
                argv: ["skills", "install", "openai"],
                cwd: sandbox.cwd,
                env: sandbox.env,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    if (request.url.includes("/package-info/")) {
                        return new Response(JSON.stringify({
                            packageName: "openai",
                            version: "0.0.3",
                            skills: [
                                {
                                    description: "Chat with a model",
                                    name: "chatgpt",
                                    title: "ChatGPT",
                                },
                                {
                                    description: "See images",
                                    name: "vision",
                                    title: "Vision",
                                },
                            ],
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
                stdin,
                stderr: stderr.writer,
                stdout: stdout.writer,
                systemLocale: "en-US",
            });

            await waitForOutputText(
                stdout,
                "Select skills to install or keep installed",
            );
            stdin.feed(" ");
            stdin.feed("\r");

            const exitCode = await execution;
            const plainOutput = stripVTControlCharacters(stdout.read()).replaceAll(
                "\u200B",
                "",
            );

            expect(exitCode).toBe(0);
            expect(stderr.read()).toBe("");
            expect(plainOutput).toContain("\n ◼ chatgpt");
            expect(plainOutput).toContain("Removing deselected skills...");
            expect(plainOutput).toContain("◆ Removed");
            expect(plainOutput).toContain("  chatgpt");
            expect(plainOutput).not.toContain(
                `Removed skill chatgpt from ${installedSkillDirectoryPath}.`,
            );
            await expect(stat(installedSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(canonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("skips overwriting an existing published skill when confirmation is declined", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const stdin = createInteractiveInput();

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "stale\n");
            stdin.feed("n\n");

            const result = await sandbox.run(
                ["skills", "install", "openai", "--skill", "chatgpt"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.3.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                    stdin,
                    stdout: {
                        isTTY: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Skill chatgpt already exists. Overwrite? [y/N] ",
            );
            expect(result.stdout).toContain("Skipped skill chatgpt.");
            expect(await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "stale\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs all published skills when --yes is passed without --skill", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const chatgptSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const visionSkillDirectoryPath = join(codexHomeDirectory, "skills", "vision");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai", "--yes"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                    {
                                        description: "See images",
                                        name: "vision",
                                        title: "Vision",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.3.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                                "package/package/skills/vision/SKILL.md": "# Vision\n",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Installing all 2 skills.");
            await expect(stat(join(chatgptSkillDirectoryPath, "SKILL.md"))).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
            await expect(stat(join(visionSkillDirectoryPath, "SKILL.md"))).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails outside a TTY when multiple skills require selection", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.3",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                    {
                                        description: "See images",
                                        name: "vision",
                                        title: "Vision",
                                    },
                                ],
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Package openai has multiple skills. Use --skill <name>, --all -y, or run in an interactive terminal.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("migrates legacy canonical skill layout on install", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const configDirectoryPath = join(storePaths.settingsFilePath, "..");
        const legacyCodexBundledPath = join(configDirectoryPath, "skills", "oo");
        const legacyRegistryPath = join(configDirectoryPath, "skills", "chatgpt");
        const legacyClaudeRoot = join(configDirectoryPath, "claude-skills");
        const legacyOpenClawRoot = join(configDirectoryPath, "openclaw-skills");
        const newOoCanonicalPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(legacyCodexBundledPath, { recursive: true });
            await Bun.write(
                resolveBundledSkillMetadataFilePath(legacyCodexBundledPath),
                renderSkillMetadataJson({ version: "0.0.1" }),
            );
            await mkdir(legacyRegistryPath, { recursive: true });
            await Bun.write(
                join(legacyRegistryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({ packageName: "foo", version: "0.0.2" }),
            );
            await mkdir(join(legacyClaudeRoot, "oo"), { recursive: true });
            await mkdir(join(legacyOpenClawRoot, "oo"), { recursive: true });

            const result = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            await expect(stat(legacyClaudeRoot)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(legacyOpenClawRoot)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(legacyRegistryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(await realpath(ooSkillDirectoryPath)).toBe(
                await realpath(newOoCanonicalPath),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
