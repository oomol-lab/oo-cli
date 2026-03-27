import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox, readLatestLogContent } from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveBundledSkillVersionFilePath,
    resolveCodexHomeDirectory,
} from "./shared.ts";

describe("skills CLI", () => {
    test("silently installs the managed Codex skill on the first run", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("Installed Codex skill");
            expect(result.stderr).toBe("");
            await expect(stat(join(skillDirectoryPath, "SKILL.md"))).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: true",
            );
            expect(await readFile(versionFilePath, "utf8")).toBe("9.9.9\n");
            expect(content).toContain(`"msg":"CLI first-run detection completed."`);
            expect(content).toContain(`"isFirstRun":true`);
            expect(content).toContain(`"shouldInstallMissingBundledSkills":true`);
            expect(content).toContain(
                `"msg":"Bundled Codex skill installed during first-run bootstrap."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-install the managed Codex skill during local development runs", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"]);
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("Installed Codex skill");
            expect(result.stderr).toBe("");
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(content).toContain(`"isFirstRun":true`);
            expect(content).toContain(`"shouldSynchronizeBundledSkills":false`);
            expect(content).toContain(`"shouldInstallMissingBundledSkills":false`);
            expect(content).not.toContain(
                `"msg":"Bundled Codex skill installed during first-run bootstrap."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-install the managed Codex skill for skills subcommands", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "uninstall"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Codex skill oo is not installed at ${skillDirectoryPath}.\n`,
            );
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("synchronizes the managed Codex skill policy from persisted settings", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const settingsFilePath = join(
            sandbox.env.XDG_CONFIG_HOME!,
            APP_NAME,
            "settings.toml",
        );

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(versionFilePath, "9.9.9\n");
            await Bun.write(
                ownershipFilePath,
                await Bun.file(
                    join(process.cwd(), "contrib", "skills", "oo", "agents", "openai.yaml"),
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

            expect(result.exitCode).toBe(0);
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: false",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("writes explicit skills install and uninstall logs", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const installResult = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });
            const installContent = await readLatestLogContent(sandbox);
            const uninstallResult = await sandbox.run(["skills", "uninstall"]);
            const uninstallContent = await readLatestLogContent(sandbox);

            expect(installResult.exitCode).toBe(0);
            expect(installContent).toContain(
                `"msg":"Bundled Codex skill installed explicitly."`,
            );
            expect(installContent).toContain(`"skillName":"oo"`);
            expect(installContent).toContain(`"path":"${skillDirectoryPath}"`);
            expect(installContent).toContain(`"version":"9.9.9"`);

            expect(uninstallResult.exitCode).toBe(0);
            expect(uninstallContent).toContain(
                `"msg":"Bundled Codex skill removed explicitly."`,
            );
            expect(uninstallContent).toContain(`"skillName":"oo"`);
            expect(uninstallContent).toContain(`"path":"${skillDirectoryPath}"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
