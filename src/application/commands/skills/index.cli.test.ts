import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { getBundledSkillSourcePath } from "./__tests__/helpers.ts";
import {
    bundledSkillDevelopmentVersion,
} from "./bundled-skill-model.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillMetadataFilePath,
    resolveClaudeHomeDirectory,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

describe("skills CLI", () => {
    test("requires login before installing published skills", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "install", "unknown"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("treats the removed allow-implicit-invocation subcommand as unknown", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "allow-implicit-invocation",
                "false",
            ]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stderr).toContain("Unknown command");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("silently installs the managed bundled skill on the first run", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
            "oo",
        );
        const canonicalFindSkillsDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
            "oo-find-skills",
        );
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const findSkillsMetadataFilePath = resolveBundledSkillMetadataFilePath(
            findSkillsDirectoryPath,
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("Installed skill");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            await expect(stat(join(skillDirectoryPath, "SKILL.md"))).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: true",
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await realpath(findSkillsDirectoryPath)).toBe(
                await realpath(canonicalFindSkillsDirectoryPath),
            );
            for (const file of getBundledSkillFiles("oo-find-skills")) {
                expect(
                    await readFile(
                        join(findSkillsDirectoryPath, file.relativePath),
                        "utf8",
                    ),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            expect(await readFile(findSkillsMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(content).toContain(`"msg":"CLI first-run detection completed."`);
            expect(content).toContain(`"isFirstRun":true`);
            expect(content).toContain(`"shouldInstallMissingBundledSkills":true`);
            expect(content).toContain(
                `"msg":"Bundled skill installed during first-run bootstrap."`,
            );
            expect(content).toContain(`"skillName":"oo-find-skills"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-install the managed bundled skill during local development runs", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"]);
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("Installed skill");
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(content).toContain(`"isFirstRun":true`);
            expect(content).toContain(`"shouldSynchronizeBundledSkills":false`);
            expect(content).toContain(`"shouldInstallMissingBundledSkills":false`);
            expect(content).not.toContain(
                `"msg":"Bundled skill installed during first-run bootstrap."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not synchronize a managed bundled skill that uses the development metadata version", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({
                    version: bundledSkillDevelopmentVersion,
                }),
            );
            await Bun.write(ownershipFilePath, "# OOMOL\n");
            await Bun.write(skillFilePath, "stale\n");

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({
                    version: bundledSkillDevelopmentVersion,
                }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe("stale\n");
            expect(content).toContain(
                `"msg":"Bundled skill synchronization skipped because the managed skill uses a development version."`,
            );
            expect(content).toContain(
                `"installedVersion":"${bundledSkillDevelopmentVersion}"`,
            );
            expect(content).not.toContain(`"msg":"Bundled skill synchronized."`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-install the managed bundled skill for skills subcommands", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "uninstall"]);

            expect(result.exitCode).toBe(1);
            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
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
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports skills add as an alias for install", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "add"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Installed skill oo to ${ooSkillDirectoryPath}.`,
                    `Installed skill oo-find-skills to ${findSkillsDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("synchronizes the managed bundled skill policy from persisted settings", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const settingsFilePath = join(
            sandbox.env.XDG_CONFIG_HOME!,
            APP_NAME,
            "settings.toml",
        );

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            await Bun.write(
                ownershipFilePath,
                await Bun.file(
                    getBundledSkillSourcePath("oo", "agents/openai.yaml"),
                ).text(),
            );
            await Bun.write(
                settingsFilePath,
                [
                    "[skills.oo]",
                    "implicit_invocation = false",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: false",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("silently installs bundled skills into Claude Code on the first run when the Claude home exists", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(claudeHomeDirectory, "skills", "oo");
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
            "oo",
            "claude",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
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
            expect(content).toContain(
                `"msg":"Bundled skill installed during first-run bootstrap."`,
            );
            expect(content).toContain(`"agentName":"claude"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("writes explicit skills install and uninstall logs", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooSkillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");
        const serializedOoSkillDirectoryPath = JSON.stringify(ooSkillDirectoryPath);
        const serializedFindSkillsDirectoryPath = JSON.stringify(findSkillsDirectoryPath);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const installResult = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });
            const installContent = await readLatestLogContent(sandbox);
            const uninstallResult = await sandbox.run(["skills", "uninstall"]);
            const uninstallContent = await readLatestLogContent(sandbox);

            expect({
                installResult: createCliSnapshot(installResult, { sandbox }),
                uninstallResult: createCliSnapshot(uninstallResult, { sandbox }),
            }).toMatchSnapshot();
            expect(installContent).toContain(
                `"msg":"Bundled skill installed explicitly."`,
            );
            expect(installContent).toContain(`"skillName":"oo"`);
            expect(installContent).toContain(`"skillName":"oo-find-skills"`);
            expect(installContent).toContain(`"path":${serializedOoSkillDirectoryPath}`);
            expect(installContent).toContain(`"path":${serializedFindSkillsDirectoryPath}`);
            expect(installContent).toContain(`"version":"9.9.9"`);

            expect(uninstallContent).toContain(
                `"msg":"Bundled skill removed explicitly."`,
            );
            expect(uninstallContent).toContain(`"skillName":"oo"`);
            expect(uninstallContent).toContain(`"path":${serializedOoSkillDirectoryPath}`);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
