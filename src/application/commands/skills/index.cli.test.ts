import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
} from "../../../../__tests__/helpers.ts";
import {
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
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

    test("does not auto-install bundled skills during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(codexHomeDirectory, "skills", "oo-find-skills");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("Installed skill");
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(findSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(content).not.toContain(
                `"msg":"Bundled skill installed during first-run bootstrap."`,
            );
            expect(content).not.toContain(`"msg":"Bundled skill synchronized."`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-refresh installed bundled skills during cli startup", async () => {
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
                    version: "0.0.1",
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
                    version: "0.0.1",
                }),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe("stale\n");
            expect(content).not.toContain(`"msg":"Bundled skill synchronized."`);
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
