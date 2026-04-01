import { mkdir, readFile, realpath, stat } from "node:fs/promises";

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
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";
import {
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

    test("installs the default bundled Codex skill when no skill name is provided", async () => {
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
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const resultVersion = "9.9.9";

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed Codex skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );

            for (const file of getBundledSkillFiles("oo")) {
                expect(
                    await readFile(join(skillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: true",
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: resultVersion }),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a bundled Codex skill by explicit name", async () => {
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
                `Installed Codex skill oo to ${skillDirectoryPath}.\n`,
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

    test("installs the bundled Codex skill with the persisted implicit invocation policy", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await Bun.write(
                storePaths.settingsFilePath,
                [
                    "[skills.oo]",
                    "implicit_invocation = false",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: false",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails when the Codex home directory is missing", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            const result = await sandbox.run(["skills", "install"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Codex is not installed. Expected the Codex home directory at ${codexHomeDirectory}.\n`,
            );
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
                `Skill name oo is already used by a non-OOMOL Codex skill at ${skillDirectoryPath}.\n`,
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

    test("uninstalls a bundled Codex skill from the Codex skills directory", async () => {
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

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const installResult = await sandbox.run(["skills", "install"]);
            expect(installResult.exitCode).toBe(0);

            const result = await sandbox.run(["skills", "uninstall"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed Codex skill oo from ${skillDirectoryPath}.\n`,
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

    test("uninstalls a published Codex skill from the Codex skills directory", async () => {
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

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(metadataFilePath, renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }));
            await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");

            const result = await sandbox.run(["skills", "uninstall", "chatgpt"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed Codex skill chatgpt from ${skillDirectoryPath}.\n`,
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

    test("rejects uninstall when the skill path escapes the Codex skills directory", async () => {
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
                "Skill name ../../outside resolves outside the local Codex skills directory.\n",
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

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(metadataFilePath, renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }));
            await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");

            const result = await sandbox.run(["skills", "remove", "chatgpt"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed Codex skill chatgpt from ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
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

            const result = await sandbox.run(["skills", "uninstall"]);

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

            const result = await sandbox.run(["skills", "uninstall"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed Codex skill oo from ${skillDirectoryPath}.\n`,
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

    test("silently synchronizes installed bundled skills when the oo version changes", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const managedSkillPath = join(skillDirectoryPath, "SKILL.md");
        const managedOwnershipPath = join(skillDirectoryPath, "agents", "openai.yaml");
        const obsoleteFilePath = join(skillDirectoryPath, "legacy.txt");
        const expectedSkillContent = await Bun.file(
            getBundledSkillFiles("oo")[0]!.sourcePath,
        ).text();
        const expectedOwnershipContent = await Bun.file(
            getBundledSkillFiles("oo").find(file => file.relativePath === "agents/openai.yaml")!.sourcePath,
        ).text();

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({ version: "0.0.1" }),
            );
            await Bun.write(managedSkillPath, "stale\n");
            await Bun.write(managedOwnershipPath, expectedOwnershipContent);
            await Bun.write(obsoleteFilePath, "obsolete\n");

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(managedSkillPath, "utf8")).toBe(
                expectedSkillContent,
            );
            await expect(stat(obsoleteFilePath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rewrites canonical bundled skill storage during synchronization even when it contains unmanaged content", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );
        const canonicalOwnershipPath = join(
            canonicalSkillDirectoryPath,
            "agents",
            "openai.yaml",
        );
        const managedOwnershipPath = join(skillDirectoryPath, "agents", "openai.yaml");
        const expectedOwnershipContent = await Bun.file(
            getBundledSkillFiles("oo").find(file => file.relativePath === "agents/openai.yaml")!.sourcePath,
        ).text();

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({ version: "0.0.1" }),
            );
            await Bun.write(managedOwnershipPath, expectedOwnershipContent);
            await Bun.write(
                canonicalOwnershipPath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(canonicalOwnershipPath, "utf8")).toContain("OOMOL");
            expect(await readFile(canonicalOwnershipPath, "utf8")).not.toContain(
                "Custom skill",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not synchronize bundled skills that do not have managed metadata", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const managedSkillPath = join(skillDirectoryPath, "SKILL.md");
        const managedOwnershipPath = join(skillDirectoryPath, "agents", "openai.yaml");
        const expectedOwnershipContent = await Bun.file(
            getBundledSkillFiles("oo").find(file => file.relativePath === "agents/openai.yaml")!.sourcePath,
        ).text();

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(managedSkillPath, "stale\n");
            await Bun.write(managedOwnershipPath, expectedOwnershipContent);

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            await expect(stat(metadataFilePath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(await readFile(managedSkillPath, "utf8")).toBe("stale\n");
            expect(await readFile(managedOwnershipPath, "utf8")).toBe(
                expectedOwnershipContent,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not silently synchronize installed bundled skills during local development runs", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const managedSkillPath = join(skillDirectoryPath, "SKILL.md");
        const managedOwnershipPath = join(skillDirectoryPath, "agents", "openai.yaml");
        const expectedOwnershipContent = await Bun.file(
            getBundledSkillFiles("oo").find(file => file.relativePath === "agents/openai.yaml")!.sourcePath,
        ).text();

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({ version: "0.0.1" }),
            );
            await Bun.write(managedSkillPath, "stale\n");
            await Bun.write(managedOwnershipPath, expectedOwnershipContent);

            const result = await sandbox.run(["--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "0.0.1" }),
            );
            expect(await readFile(managedSkillPath, "utf8")).toBe("stale\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not install bundled skills automatically after the first run", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await Bun.write(storePaths.settingsFilePath, "lang = \"en\"\n");

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("synchronizes a same-name bundled skill when it has managed metadata", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const managedSkillPath = join(skillDirectoryPath, "SKILL.md");
        const expectedOwnershipContent = await Bun.file(
            getBundledSkillFiles("oo").find(file => file.relativePath === "agents/openai.yaml")!.sourcePath,
        ).text();
        const expectedSkillContent = await Bun.file(
            getBundledSkillFiles("oo")[0]!.sourcePath,
        ).text();

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({ version: "0.0.1" }),
            );
            await Bun.write(
                ownershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );
            await Bun.write(managedSkillPath, "stale\n");

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson({ version: "9.9.9" }),
            );
            expect(await readFile(ownershipFilePath, "utf8")).toBe(
                expectedOwnershipContent,
            );
            expect(await readFile(managedSkillPath, "utf8")).toBe(
                expectedSkillContent,
            );
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
                                "package/package/skills/chatgpt/agents/openai.yaml":
                                    "agent\n",
                            }));
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Installed Codex skill chatgpt to ${skillDirectoryPath}.\n`,
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

    test("rejects published registry skills that escape the Codex skills directory", async () => {
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
                "Skill name ../../outside resolves outside the local Codex skills directory.\n",
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
                `Installed Codex skill chatgpt to ${selectedSkillDirectoryPath}.`,
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
                `Removed Codex skill chatgpt from ${installedSkillDirectoryPath}.`,
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
            expect(result.stdout).toContain("Skipped Codex skill chatgpt.");
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
});
