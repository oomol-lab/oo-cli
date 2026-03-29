import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./shared.ts";

describe("skills commands", () => {
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
                formatBundledSkillMetadataContent(resultVersion),
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
                formatBundledSkillMetadataContent(resultVersion),
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

    test("does not uninstall a same-name skill that is not managed by OOMOL", async () => {
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
                `Codex skill oo is not installed at ${skillDirectoryPath}.\n`,
            );
            await expect(stat(skillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstall removes canonical bundled skill storage even when it contains unmanaged content", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
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
                formatBundledSkillMetadataContent("0.0.1"),
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
                formatBundledSkillMetadataContent("9.9.9"),
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
                formatBundledSkillMetadataContent("0.0.1"),
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
                formatBundledSkillMetadataContent("9.9.9"),
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

    test("rebuilds managed skills that do not have the metadata file yet", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const managedSkillPath = join(skillDirectoryPath, "SKILL.md");
        const managedOwnershipPath = join(skillDirectoryPath, "agents", "openai.yaml");
        const expectedSkillContent = await Bun.file(
            getBundledSkillFiles("oo")[0]!.sourcePath,
        ).text();
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
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                formatBundledSkillMetadataContent("9.9.9"),
            );
            expect(await readFile(managedSkillPath, "utf8")).toBe(
                expectedSkillContent,
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
                formatBundledSkillMetadataContent("0.0.1"),
            );
            await Bun.write(managedSkillPath, "stale\n");
            await Bun.write(managedOwnershipPath, expectedOwnershipContent);

            const result = await sandbox.run(["--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                formatBundledSkillMetadataContent("0.0.1"),
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

    test("does not synchronize a same-name skill that is not managed by OOMOL", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                metadataFilePath,
                formatBundledSkillMetadataContent("0.0.1"),
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

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                formatBundledSkillMetadataContent("0.0.1"),
            );
            expect(await readFile(ownershipFilePath, "utf8")).not.toContain("OOMOL");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function formatBundledSkillMetadataContent(version: string): string {
    return `${JSON.stringify({ version }, null, 2)}\n`;
}
