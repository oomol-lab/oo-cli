import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";
import {
    resolveBundledSkillVersionFilePath,
    resolveCodexHomeDirectory,
} from "./shared.ts";

describe("skills commands", () => {
    test("installs a bundled Codex skill into the Codex skills directory", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);
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

            for (const file of getBundledSkillFiles("oo")) {
                expect(
                    await readFile(join(skillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await Bun.file(file.sourcePath).text());
            }
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: true",
            );
            expect(await readFile(versionFilePath, "utf8")).toBe(
                `${resultVersion}\n`,
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

    test("uninstalls a bundled Codex skill from the Codex skills directory", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");

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

    test("silently synchronizes installed bundled skills when the oo version changes", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);
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
            await Bun.write(versionFilePath, "0.0.1\n");
            await Bun.write(managedSkillPath, "stale\n");
            await Bun.write(managedOwnershipPath, expectedOwnershipContent);

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(versionFilePath, "utf8")).toBe("9.9.9\n");
            expect(await readFile(managedSkillPath, "utf8")).toBe(
                expectedSkillContent,
            );
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
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(versionFilePath, "0.0.1\n");
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
            expect(await readFile(versionFilePath, "utf8")).toBe("0.0.1\n");
            expect(await readFile(ownershipFilePath, "utf8")).not.toContain("OOMOL");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
