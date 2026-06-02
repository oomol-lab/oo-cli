import { lstat, mkdir, readFile, realpath, stat, symlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { readBundledSkillSourceContent } from "./__tests__/helpers.ts";
import { bundledSkillDevelopmentVersion } from "./bundled-skill-model.ts";
import {
    resolveBundledSkillMetadataFilePath,
} from "./bundled-skill-paths.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

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

    test("auto-installs bundled skills during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(universalHomeDirectory, "skills", "oo-find-skills");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            expect(result.stdout).not.toContain("Installed skill");
            await expect(stat(skillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
            await expect(stat(findSkillsDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
            expect(content).not.toContain(
                `"msg":"Bundled skill installed during first-run bootstrap."`,
            );
            expect(content).toContain(
                `"msg":"Bundled skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("auto-refreshes installed bundled skills during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                metadataFilePath,
                renderSkillMetadataJson({
                    version: "0.0.1",
                }),
            );
            await Bun.write(skillFilePath, "stale\n");

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await readBundledSkillSourceContent("oo", "SKILL.md"),
            );
            expect(content).toContain(
                `"msg":"Bundled skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-refresh installed bundled skills during development-version cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillTargets = availableBundledSkillNames.map(skillName => ({
            directoryPath: join(universalHomeDirectory, "skills", skillName),
            name: skillName,
        }));
        const installedVersion = "9.9.9";

        try {
            for (const skillTarget of skillTargets) {
                await mkdir(skillTarget.directoryPath, { recursive: true });
                await Bun.write(
                    resolveBundledSkillMetadataFilePath(skillTarget.directoryPath),
                    renderSkillMetadataJson({
                        version: installedVersion,
                    }),
                );
                await Bun.write(
                    join(skillTarget.directoryPath, "SKILL.md"),
                    `# Local ${skillTarget.name}\n`,
                );
            }

            const result = await sandbox.run(["--help"], {
                version: bundledSkillDevelopmentVersion,
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            for (const skillTarget of skillTargets) {
                expect(
                    await readFile(join(skillTarget.directoryPath, "SKILL.md"), "utf8"),
                ).toBe(
                    `# Local ${skillTarget.name}\n`,
                );
                expect(
                    await readFile(
                        resolveBundledSkillMetadataFilePath(skillTarget.directoryPath),
                        "utf8",
                    ),
                ).toBe(renderSkillMetadataJson({
                    version: installedVersion,
                }));
            }
            expect(content).toContain(
                `"msg":"Bundled skill startup synchronization skipped because the current CLI version is a development version."`,
            );
            expect(content).not.toContain(
                `"msg":"Bundled skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not auto-refresh development-version bundled skills during release-version cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillTargets = availableBundledSkillNames.map(skillName => ({
            directoryPath: join(universalHomeDirectory, "skills", skillName),
            name: skillName,
        }));

        try {
            for (const skillTarget of skillTargets) {
                await mkdir(skillTarget.directoryPath, { recursive: true });
                await Bun.write(
                    resolveBundledSkillMetadataFilePath(skillTarget.directoryPath),
                    renderSkillMetadataJson({
                        version: bundledSkillDevelopmentVersion,
                    }),
                );
                await Bun.write(
                    join(skillTarget.directoryPath, "SKILL.md"),
                    `# Local ${skillTarget.name}\n`,
                );
            }

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            for (const skillTarget of skillTargets) {
                expect(
                    await readFile(join(skillTarget.directoryPath, "SKILL.md"), "utf8"),
                ).toBe(
                    `# Local ${skillTarget.name}\n`,
                );
                expect(
                    await readFile(
                        resolveBundledSkillMetadataFilePath(skillTarget.directoryPath),
                        "utf8",
                    ),
                ).toBe(renderSkillMetadataJson({
                    version: bundledSkillDevelopmentVersion,
                }));
            }
            expect(content).toContain(
                `"msg":"Bundled skill startup synchronization skipped because the installed skill is a development version."`,
            );
            expect(content).not.toContain(
                `"msg":"Bundled skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("publishes canonical registry skills during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
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
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                "# ChatGPT\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "openai",
                    version: "0.0.3",
                }),
            );

            const result = await sandbox.run(["--help"], {
                fetcher: async () => {
                    throw new Error("startup synchronization should not fetch");
                },
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            expect(result.stdout).not.toContain("Installed skill");
            expect(await readFile(join(claudeSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "# ChatGPT\n",
            );
            expect(content).toContain(
                `"msg":"Registry skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("leaves synchronized registry symlink targets unchanged during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const universalSkillsDirectory = join(universalHomeDirectory, "skills");
        const universalSkillDirectoryPath = join(universalSkillsDirectory, "chatgpt");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const codeBuddySkillsDirectory = join(codeBuddyHomeDirectory, "skills");
        const codeBuddySkillDirectoryPath = join(codeBuddySkillsDirectory, "chatgpt");
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
            await mkdir(universalSkillsDirectory, { recursive: true });
            await mkdir(codeBuddySkillsDirectory, { recursive: true });
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                "# ChatGPT\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "openai",
                    version: "0.0.3",
                }),
            );
            // The universal host is always provisioned, so it must already hold a
            // correct symlink for the registry skill to stay unchanged at startup.
            await symlink(
                canonicalSkillDirectoryPath,
                universalSkillDirectoryPath,
                process.platform === "win32" ? "junction" : "dir",
            );
            await symlink(
                canonicalSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                process.platform === "win32" ? "junction" : "dir",
            );

            const result = await sandbox.run(["--help"], {
                fetcher: async () => {
                    throw new Error("startup synchronization should not fetch");
                },
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            expect(await realpath(universalSkillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(universalSkillDirectoryPath)).isSymbolicLink()).toBeTrue();
            expect(await realpath(codeBuddySkillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(codeBuddySkillDirectoryPath)).isSymbolicLink()).toBeTrue();
            expect(await readFile(join(codeBuddySkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "# ChatGPT\n",
            );
            expect(content).not.toContain(
                `"msg":"Registry skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not synchronize agent-native local skills during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const universalSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "campaign-writer",
        );
        const skillFilePath = join(universalSkillDirectoryPath, "SKILL.md");

        try {
            await mkdir(universalSkillDirectoryPath, { recursive: true });
            await Bun.write(
                skillFilePath,
                "# Campaign Writer\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(universalSkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(["--help"], {
                fetcher: async () => {
                    throw new Error("startup synchronization should not fetch");
                },
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            expect(await readFile(skillFilePath, "utf8")).toBe(
                "# Campaign Writer\n",
            );
            expect(content).not.toContain(
                `"msg":"Local skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not overwrite synchronized registry targets with same-name local skills", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const universalSkillsDirectory = join(universalHomeDirectory, "skills");
        const universalSkillDirectoryPath = join(universalSkillsDirectory, "chatgpt");
        const codeBuddySkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            "chatgpt",
        );
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const registryCanonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(universalSkillsDirectory, { recursive: true });
            await mkdir(registryCanonicalSkillDirectoryPath, { recursive: true });
            await mkdir(codeBuddySkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(registryCanonicalSkillDirectoryPath, "SKILL.md"),
                "# Registry ChatGPT\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(registryCanonicalSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "openai",
                    version: "0.0.3",
                }),
            );
            await Bun.write(
                join(codeBuddySkillDirectoryPath, "SKILL.md"),
                "# Local ChatGPT\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(codeBuddySkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(["--help"], {
                fetcher: async () => {
                    throw new Error("startup synchronization should not fetch");
                },
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(join(universalSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "# Registry ChatGPT\n",
            );
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(universalSkillDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson({
                packageName: "openai",
                version: "0.0.3",
            }));
            expect(content).toContain(
                `"msg":"Registry skill synchronized during CLI startup."`,
            );
            expect(content).not.toContain(
                `"msg":"Local skill synchronized during CLI startup."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not overwrite unmanaged bundled skill targets during cli startup", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(skillFilePath, "# Custom\n");

            const result = await sandbox.run(["--help"], {
                version: "9.9.9",
            });
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Options:");
            expect(await readFile(skillFilePath, "utf8")).toBe("# Custom\n");
            expect(content).toContain(
                `"msg":"Bundled skill startup synchronization skipped because the target is not managed by oo."`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports skills remove as an alias for uninstall", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(universalHomeDirectory, "skills", "oo-find-skills");
        const createSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-create-skill");
        const publishSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-publish-skill");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
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
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports skills add as an alias for install", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "add"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    "Installed 4 skills to Universal.",
                    "Skills: oo, oo-find-skills, oo-create-skill, oo-publish-skill",
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(universalHomeDirectory, "skills", "oo-find-skills");
        const publishSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-publish-skill");
        const serializedOoSkillDirectoryPath = JSON.stringify(ooSkillDirectoryPath);
        const serializedFindSkillsDirectoryPath = JSON.stringify(findSkillsDirectoryPath);
        const serializedPublishSkillDirectoryPath = JSON.stringify(publishSkillDirectoryPath);

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

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
            expect(installContent).toContain(`"skillName":"oo-publish-skill"`);
            expect(installContent).toContain(`"path":${serializedOoSkillDirectoryPath}`);
            expect(installContent).toContain(`"path":${serializedFindSkillsDirectoryPath}`);
            expect(installContent).toContain(`"path":${serializedPublishSkillDirectoryPath}`);
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
