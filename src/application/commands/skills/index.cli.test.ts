import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./shared.ts";

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

    test("silently installs the managed Codex skill on the first run", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
            "oo",
        );
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("Installed Codex skill");
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
                formatBundledSkillMetadataContent("9.9.9"),
            );
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

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("Installed Codex skill");
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
            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
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
                formatBundledSkillMetadataContent("9.9.9"),
            );
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

            expect(createCliSnapshot(result)).toMatchSnapshot();
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
        const serializedSkillDirectoryPath = JSON.stringify(skillDirectoryPath);

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
                `"msg":"Bundled Codex skill installed explicitly."`,
            );
            expect(installContent).toContain(`"skillName":"oo"`);
            expect(installContent).toContain(`"path":${serializedSkillDirectoryPath}`);
            expect(installContent).toContain(`"version":"9.9.9"`);

            expect(uninstallContent).toContain(
                `"msg":"Bundled Codex skill removed explicitly."`,
            );
            expect(uninstallContent).toContain(`"skillName":"oo"`);
            expect(uninstallContent).toContain(`"path":${serializedSkillDirectoryPath}`);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function formatBundledSkillMetadataContent(version: string): string {
    return `${JSON.stringify({ version }, null, 2)}\n`;
}
