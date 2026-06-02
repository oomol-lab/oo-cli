import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";

import { dirname, join } from "node:path";
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
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { readBundledSkillSourceContent } from "./__tests__/helpers.ts";
import { bundledSkillDevelopmentVersion } from "./bundled-skill-model.ts";
import {
    canonicalLocalSkillsDirectoryName,
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillMetadataFilePath,
} from "./bundled-skill-paths.ts";
import {
    getBundledSkillFiles,
    readBundledSkillFileContent,
} from "./embedded-assets.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { installedRegistrySkillCompatibility } from "./registry-skill-markdown.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skills commands", () => {
    test("installs all bundled skills when no skill name is provided", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(universalHomeDirectory, "skills", "oo-find-skills");
        const createSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-create-skill");
        const publishSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-publish-skill");
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
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install"], {
                version: resultVersion,
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
            expect(parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            )).toMatchObject({
                properties: {
                    bundled_skill: "__all__",
                    command_full: "skills.install",
                    package_kind: "bundled",
                    skill_ids_count_bucket: "1-5",
                    skill_ids_sample: [
                        "oo",
                        "oo-find-skills",
                        "oo-create-skill",
                        "oo-publish-skill",
                    ],
                    skill_ids_truncated: false,
                },
            });
            await expectCopiedSkillDirectory(
                ooSkillDirectoryPath,
                ooCanonicalSkillDirectoryPath,
            );
            await expectCopiedSkillDirectory(
                findSkillsDirectoryPath,
                findSkillsCanonicalSkillDirectoryPath,
            );
            await expectCopiedSkillDirectory(
                createSkillDirectoryPath,
                createSkillCanonicalSkillDirectoryPath,
            );
            await expectCopiedSkillDirectory(
                publishSkillDirectoryPath,
                publishSkillCanonicalSkillDirectoryPath,
            );

            for (const file of getBundledSkillFiles("oo")) {
                expect(
                    await readFile(join(ooSkillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await readBundledSkillFileContent(file));
            }
            for (const file of getBundledSkillFiles("oo-find-skills")) {
                expect(
                    await readFile(join(findSkillsDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await readBundledSkillFileContent(file));
            }
            for (const file of getBundledSkillFiles("oo-create-skill")) {
                expect(
                    await readFile(join(createSkillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await readBundledSkillFileContent(file));
            }
            for (const file of getBundledSkillFiles("oo-publish-skill")) {
                expect(
                    await readFile(join(publishSkillDirectoryPath, file.relativePath), "utf8"),
                ).toBe(await readBundledSkillFileContent(file));
            }
            expect(await readFile(ooMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
            expect(await readFile(findSkillsMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
            expect(await readFile(createSkillMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
            expect(await readFile(publishSkillMetadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("leaves agent-native local skills untouched during bundled install", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillName = "local-helper";
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            skillName,
        );
        const skillMarkdown = createLocalSkillMarkdown(
            skillName,
            "Agent-native local helper.",
            "Local",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(join(skillDirectoryPath, "SKILL.md"), skillMarkdown);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "Installed 4 skills to Universal.",
                    "Skills: oo, oo-find-skills, oo-create-skill, oo-publish-skill",
                    "",
                ].join("\n"),
            );
            expect(await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                skillMarkdown,
            );
            expect(await readFile(resolveManagedSkillMetadataFilePath(skillDirectoryPath), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("ignores legacy canonical local storage during bundled install", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillName = "legacy-local-helper";
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            skillName,
        );
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = join(
            dirname(storePaths.settingsFilePath),
            "skills",
            canonicalLocalSkillsDirectoryName,
            skillName,
        );
        const skillMarkdown = createLocalSkillMarkdown(
            skillName,
            "Legacy local helper.",
            "Legacy",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), skillMarkdown);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).not.toContain(skillName);
            await expect(stat(skillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                skillMarkdown,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("colors compact bundled install summaries when stdout supports colors", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install"], {
                stdout: {
                    hasColors: true,
                },
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(stripVTControlCharacters(result.stdout)).toBe(
                "Installed 4 skills to Universal.\nSkills: oo, oo-find-skills, oo-create-skill, oo-publish-skill\n",
            );
            expect(result.stdout).toContain("\u001B[32mInstalled\u001B[39m");
            expect(result.stdout).toContain("\u001B[36mUniversal\u001B[39m");
            expect(result.stdout).toContain("\u001B[36moo\u001B[39m");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a bundled skill by explicit name", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
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
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a registry package when a bundled skill name has an explicit version", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "runtime");
        const requests: Request[] = [];

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "oo@0.0.2", "--skill", "runtime"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "oo",
                                version: "0.0.2",
                                skills: [
                                    {
                                        description: "Run OO workflows",
                                        name: "runtime",
                                        title: "Runtime",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/oo/-/meta/oo-0.0.2.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/runtime/SKILL.md": "# Runtime\n",
                            }));
                        }

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Installed skill runtime to ${skillDirectoryPath}.\n`,
            );
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/oo/0.0.2",
                "https://registry.oomol.com/-/oomol/packages/oo/0.0.2/download-count",
                "https://registry.oomol.com/oo/-/meta/oo-0.0.2.tgz",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("explicit bundled skill install overwrites a managed development-version installation", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
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

        try {
            const expectedSkillContent = await readBundledSkillSourceContent("oo", "SKILL.md");

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
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo-find-skills");
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
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo-find-skills"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo-find-skills to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs the oo-publish-skill bundled skill by explicit name", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo-publish-skill");
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
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "install", "oo-publish-skill"], {
                version: resultVersion,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Installed skill oo-publish-skill to ${skillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata(resultVersion)),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("provisions the universal host on install when no agent home exists yet", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");

        try {
            const result = await sandbox.run(["skills", "install"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "Installed 4 skills to Universal.",
                    "Skills: oo, oo-find-skills, oo-create-skill, oo-publish-skill",
                    "",
                ].join("\n"),
            );
            await expect(stat(ooSkillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into both Universal and Claude Code when both homes exist", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalOoSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const claudeOoSkillDirectoryPath = join(claudeHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const universalCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "universal",
        );
        const claudeCanonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "claude",
        );

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, Claude Code.\n",
            );
            await expectCopiedSkillDirectory(
                universalOoSkillDirectoryPath,
                universalCanonicalSkillDirectoryPath,
            );
            await expectCopiedSkillDirectory(
                claudeOoSkillDirectoryPath,
                claudeCanonicalSkillDirectoryPath,
            );

            for (const file of getBundledSkillFiles("oo", "universal")) {
                expect(
                    await readFile(
                        join(universalOoSkillDirectoryPath, file.relativePath),
                        "utf8",
                    ),
                ).toBe(await readBundledSkillFileContent(file));
            }

            for (const file of getBundledSkillFiles("oo", "claude")) {
                expect(
                    await readFile(
                        join(claudeOoSkillDirectoryPath, file.relativePath),
                        "utf8",
                    ),
                ).toBe(await readBundledSkillFileContent(file));
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs bundled skills into Claude Code when only Claude Code is installed", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
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
            // The universal host is always provisioned, so Claude Code is
            // installed alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, Claude Code.\n",
            );
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
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
        const hermesHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "hermes");
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
            // The universal host is always provisioned, so Hermes is installed
            // alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, Hermes.\n",
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            const installedSkillMarkdown = await readFile(skillFilePath, "utf8");

            expect(installedSkillMarkdown).toBe(
                await readBundledSkillFileContent(hermesSkillFile),
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
        const openClawHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "openclaw");
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
            // The universal host is always provisioned, so OpenClaw is installed
            // alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, OpenClaw.\n",
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
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
        const qoderWorkHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "qoderwork");
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
            // The universal host is always provisioned, so QoderWork is
            // installed alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, QoderWork.\n",
            );
            expect((await stat(qoderWorkSkillsDirectoryPath)).isDirectory()).toBeTrue();
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            const installedSkillMarkdown = await readFile(skillFilePath, "utf8");

            expect(installedSkillMarkdown).toBe(
                await readBundledSkillFileContent(qoderWorkSkillFile),
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
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
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
            // The universal host is always provisioned, so CodeBuddy is
            // installed alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, CodeBuddy.\n",
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await readBundledSkillFileContent(codeBuddySkillFile),
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

    test("installs bundled skills into DeepSeek TUI using the CodeBuddy skill template", async () => {
        const sandbox = await createCliSandbox();
        const deepSeekTuiHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "deepseek-tui");
        const deepSeekTuiSkillsDirectoryPath = join(deepSeekTuiHomeDirectory, "skills");
        const skillDirectoryPath = join(deepSeekTuiHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "deepseek-tui",
        );
        const metadataFilePath = resolveBundledSkillMetadataFilePath(skillDirectoryPath);
        const skillFilePath = join(skillDirectoryPath, "SKILL.md");
        const deepSeekTuiSkillFile = getBundledSkillFiles("oo", "deepseek-tui")
            .find(file => file.relativePath === "SKILL.md");

        try {
            if (deepSeekTuiSkillFile === undefined) {
                throw new Error("Missing DeepSeek TUI oo SKILL.md fixture");
            }

            await mkdir(deepSeekTuiHomeDirectory, { recursive: true });
            await expect(stat(deepSeekTuiSkillsDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });

            const result = await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            // The universal host is always provisioned, so DeepSeek TUI is
            // installed alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, DeepSeek TUI.\n",
            );
            expect((await stat(deepSeekTuiSkillsDirectoryPath)).isDirectory()).toBeTrue();
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await readBundledSkillFileContent(deepSeekTuiSkillFile),
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
        const workBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "workbuddy");
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
            // The universal host is always provisioned, so WorkBuddy is
            // installed alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, WorkBuddy.\n",
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await readBundledSkillFileContent(workBuddySkillFile),
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
        const traeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae");
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
            // The universal host is always provisioned, so Trae is installed
            // alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, Trae.\n",
            );
            expect((await stat(traeSkillsDirectoryPath)).isDirectory()).toBeTrue();
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await readBundledSkillFileContent(traeSkillFile),
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
        const traeCnHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae-cn");
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
            // The universal host is always provisioned, so Trae CN is installed
            // alongside it.
            expect(result.stdout).toBe(
                "Installed skill oo to 2 agents: Universal, Trae CN.\n",
            );
            expect((await stat(traeCnSkillsDirectoryPath)).isDirectory()).toBeTrue();
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );
            expect(await readFile(skillFilePath, "utf8")).toBe(
                await readBundledSkillFileContent(traeCnSkillFile),
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
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
            await mkdir(universalHomeDirectory, { recursive: true });
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

    test("`--force` overwrites an unmanaged same-name bundled host directory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });

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

            const result = await sandbox.run(["skills", "install", "oo", "--force"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const metadataPath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
            const metadataContent = await readFile(metadataPath, "utf8");
            expect(metadataContent).toContain("\"kind\": \"bundled\"");
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            )!;
            expect(telemetryPayload).toMatchObject({
                properties: {
                    bundled_skill: "oo",
                    command_full: "skills.install",
                    has_force: true,
                    package_kind: "bundled",
                },
            });
            expect(telemetryPayload.properties).not.toHaveProperty("cwd");
            expect(telemetryPayload.properties).not.toHaveProperty("path");
            expect(telemetryPayload.properties).not.toHaveProperty("file_name");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("`-f` short flag matches `--force` for unmanaged bundled host overwrites", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(join(skillDirectoryPath, "user-file.txt"), "user content");

            const result = await sandbox.run(["skills", "install", "oo", "-f"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const metadataPath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
            const metadataContent = await readFile(metadataPath, "utf8");
            expect(metadataContent).toContain("\"kind\": \"bundled\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("`--force` overwrites unmanaged content in the bundled canonical storage", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
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
            await mkdir(universalHomeDirectory, { recursive: true });
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

            const result = await sandbox.run(["skills", "install", "oo", "--force"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            // After overwrite, canonical metadata should exist and indicate bundled.
            const metadataPath = resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath);
            const metadataContent = await readFile(metadataPath, "utf8");
            expect(metadataContent).toContain("\"kind\": \"bundled\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls all bundled skills from the Universal skills directory when no skill name is provided", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const findSkillsDirectoryPath = join(universalHomeDirectory, "skills", "oo-find-skills");
        const createSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-create-skill");
        const publishSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo-publish-skill");
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
            await mkdir(universalHomeDirectory, { recursive: true });

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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const hermesHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "hermes");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const workBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "workbuddy");
        const traeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae");
        const traeCnHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae-cn");
        const openClawHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "openclaw");
        const qoderWorkHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "qoderwork");
        const deepSeekTuiHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "deepseek-tui");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
        const hermesSkillDirectoryPath = join(hermesHomeDirectory, "skills", "chatgpt");
        const codeBuddySkillDirectoryPath = join(codeBuddyHomeDirectory, "skills", "chatgpt");
        const workBuddySkillDirectoryPath = join(workBuddyHomeDirectory, "skills", "chatgpt");
        const traeSkillDirectoryPath = join(traeHomeDirectory, "skills", "chatgpt");
        const traeCnSkillDirectoryPath = join(traeCnHomeDirectory, "skills", "chatgpt");
        const openClawSkillDirectoryPath = join(openClawHomeDirectory, "skills", "chatgpt");
        const qoderWorkSkillDirectoryPath = join(qoderWorkHomeDirectory, "skills", "chatgpt");
        const deepSeekTuiSkillDirectoryPath = join(deepSeekTuiHomeDirectory, "skills", "chatgpt");
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
                universalSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
            ]) {
                await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            }
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            for (const skillDirectoryPath of [
                universalSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
                deepSeekTuiSkillDirectoryPath,
            ]) {
                await Bun.write(
                    resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                    renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
                );
                await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            }
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");

            const result = await sandbox.run(["skills", "uninstall", "chatgpt"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill chatgpt from ${universalSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${claudeSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${hermesSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${codeBuddySkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${workBuddySkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${traeSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${traeCnSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${openClawSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${qoderWorkSkillDirectoryPath}.`,
                    `Removed skill chatgpt from ${deepSeekTuiSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            for (const skillDirectoryPath of [
                universalSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
                deepSeekTuiSkillDirectoryPath,
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

    test("uninstalls matching registry and single local skills with the same name", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "shared-skill";
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const claudeSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            skillName,
        );
        const codeBuddySkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            skillName,
        );
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
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
                mkdir(registryCanonicalSkillDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(claudeSkillDirectoryPath),
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
            );
            await Bun.write(join(claudeSkillDirectoryPath, "SKILL.md"), "# Registry\n");
            await Bun.write(join(registryCanonicalSkillDirectoryPath, "SKILL.md"), "# Registry\n");
            await Bun.write(join(codeBuddySkillDirectoryPath, "SKILL.md"), localSkillContent);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(codeBuddySkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

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
            await expect(stat(registryCanonicalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails and keeps multiple local matches without an agent", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "ambiguous-local";
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const universalSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            skillName,
        );
        const codeBuddySkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
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
                mkdir(universalSkillDirectoryPath, { recursive: true }),
                mkdir(codeBuddySkillDirectoryPath, { recursive: true }),
            ]);
            await Promise.all([
                Bun.write(join(universalSkillDirectoryPath, "SKILL.md"), skillContent),
                Bun.write(join(codeBuddySkillDirectoryPath, "SKILL.md"), skillContent),
                Bun.write(
                    resolveManagedSkillMetadataFilePath(universalSkillDirectoryPath),
                    renderSkillMetadataJson(createLocalSkillMetadata()),
                ),
                Bun.write(
                    resolveManagedSkillMetadataFilePath(codeBuddySkillDirectoryPath),
                    renderSkillMetadataJson(createLocalSkillMetadata()),
                ),
            ]);

            const result = await sandbox.run(["skills", "remove", skillName]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Warning: Local skill ${skillName} exists in multiple local sources (codebuddy, universal). Nothing was removed; pass --agent to choose one.\n`,
            );
            await expect(stat(universalSkillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
            await expect(stat(codeBuddySkillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uninstalls one local match when an agent is provided", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "agent-local";
        const universalSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal"),
            skillName,
        );
        const codeBuddySkillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy"),
            skillName,
        );
        const skillContent = createLocalSkillMarkdown(
            skillName,
            "Agent local workflow.",
            "Agent Local",
        );

        try {
            await Promise.all([
                writeLocalSkillDirectory(universalSkillDirectoryPath, skillContent),
                writeLocalSkillDirectory(codeBuddySkillDirectoryPath, skillContent),
            ]);

            const result = await sandbox.run([
                "skills",
                "remove",
                skillName,
                "--agent",
                "universal",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                `Removed skill ${skillName} from ${universalSkillDirectoryPath}.\n`,
            );
            expect(result.stderr).toBe("");
            await expect(stat(universalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(codeBuddySkillDirectoryPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not uninstall a same-name non-oo skill without local metadata", async () => {
        const sandbox = await createCliSandbox();
        const skillName = "local-copy";
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codeBuddyHomeDirectory,
            skillName,
        );

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
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
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects uninstall when the skill path escapes the local skills directory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const escapedSkillDirectoryPath = join(
            universalHomeDirectory,
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
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(escapedSkillDirectoryPath, { recursive: true });
            await mkdir(escapedCanonicalSkillDirectoryPath, { recursive: true });
            await Bun.write(
                resolveManagedSkillMetadataFilePath(escapedSkillDirectoryPath),
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
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

    test("uninstalls bundled skills from both Universal and Claude Code when both homes exist", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "oo");

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "uninstall", "oo"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Removed skill oo from ${universalSkillDirectoryPath}.`,
                    `Removed skill oo from ${claudeSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            await expect(stat(universalSkillDirectoryPath)).rejects.toMatchObject({
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const openClawHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "openclaw");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const skillDirectoryPath = join(openClawHomeDirectory, "skills", "oo");

        try {
            await mkdir(openClawHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], {
                version: "9.9.9",
            });

            const result = await sandbox.run(["skills", "uninstall", "oo"]);

            expect(result.exitCode).toBe(0);
            // The universal host is always provisioned, so its copy is removed
            // alongside the OpenClaw copy.
            expect(result.stdout).toBe(
                [
                    `Removed skill oo from ${universalSkillDirectoryPath}.`,
                    `Removed skill oo from ${skillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            await expect(stat(universalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");

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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", ".system");

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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
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
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
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
            await mkdir(universalHomeDirectory, { recursive: true });
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
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
                    "Use `oo::self::chat` for the remote workflow.",
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
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
            );
            expect(requests).toHaveLength(3);
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
            expect(requests[1]!.headers.get("Authorization")).toBe("secret-1");
            expect(requests[2]!.headers.get("Authorization")).toBe("secret-1");
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "skills.install",
                    package_kind: "registry",
                    package_name: "openai",
                    skill_ids_count_bucket: "1-5",
                    skill_ids_sample: ["chatgpt"],
                    skill_ids_truncated: false,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a scoped registry skill by explicit package version", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
        const requests: Request[] = [];

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "@alice/openai@0.0.2", "--skill", "chatgpt"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "@alice/openai",
                                version: "0.0.2",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/@alice/openai/-/meta/openai-0.0.2.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                            }));
                        }

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/%40alice%2Fopenai/0.0.2",
                "https://registry.oomol.com/-/oomol/packages/@alice/openai/0.0.2/download-count",
                "https://registry.oomol.com/@alice/openai/-/meta/openai-0.0.2.tgz",
            ]);
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "@alice/openai", version: "0.0.2" })),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a shared registry package by package share id", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
        const requests: Request[] = [];

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "add", "openai#share-1", "--skill", "chatgpt"],
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

                        if (request.url.endsWith("/package-shares/download-meta/share-1")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                            }));
                        }

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
            );
            expect(requests.map(request => request.url)).toEqual([
                "https://registry.oomol.com/-/oomol/package-info/openai/latest",
                "https://registry.oomol.com/-/oomol/packages/openai/0.0.3/download-count",
                "https://registry.oomol.com/-/oomol/package-shares/download-meta/share-1",
            ]);
            expect(requests.every(request =>
                request.headers.get("Authorization") === "secret-1",
            )).toBeTrue();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uploads installed registry skills while excluding bundled and local skills", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const registrySkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const bundledSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const localSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "local-helper",
        );
        const registryCanonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const requests: Array<{
            authorization: string | null;
            body: unknown;
            method: string;
            url: string;
        }> = [];

        try {
            await Promise.all([
                mkdir(registrySkillDirectoryPath, { recursive: true }),
                mkdir(bundledSkillDirectoryPath, { recursive: true }),
                mkdir(localSkillDirectoryPath, { recursive: true }),
                mkdir(registryCanonicalSkillDirectoryPath, { recursive: true }),
            ]);
            await writeAuthFile(sandbox);
            await Bun.write(join(registrySkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            await Bun.write(join(registryCanonicalSkillDirectoryPath, "SKILL.md"), "# ChatGPT\n");
            await Bun.write(
                resolveManagedSkillMetadataFilePath(registrySkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "openai",
                    version: "0.0.3",
                }),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(registryCanonicalSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "openai",
                    version: "0.0.4",
                }),
            );
            await Bun.write(
                resolveBundledSkillMetadataFilePath(bundledSkillDirectoryPath),
                renderSkillMetadataJson({
                    version: "9.9.9",
                }),
            );
            await Bun.write(
                join(localSkillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: local-helper",
                    "description: Local helper",
                    "---",
                    "",
                ].join("\n"),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(localSkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(["skills", "sync", "upload"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const body = await request.json();

                    requests.push({
                        authorization: request.headers.get("Authorization"),
                        body,
                        method: request.method,
                        url: request.url,
                    });

                    return new Response(JSON.stringify(body));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("Uploaded 1 registry skills.\n");
            expect(requests).toHaveLength(1);
            expect(requests[0]).toMatchObject({
                authorization: "secret-1",
                method: "PUT",
                url: "https://cli-api.oomol.com/v1/skills",
            });
            expect(requests[0]!.body).toEqual([
                {
                    packageName: "openai",
                    skillName: "chatgpt",
                    version: "0.0.4",
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uploads registry skills with ignore patterns and explicit source", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const chatSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const captionSkillDirectoryPath = join(universalHomeDirectory, "skills", "caption");
        const requests: Array<{
            body: unknown;
        }> = [];

        try {
            await Promise.all([
                mkdir(chatSkillDirectoryPath, { recursive: true }),
                mkdir(captionSkillDirectoryPath, { recursive: true }),
            ]);
            await writeAuthFile(sandbox);
            await Bun.write(
                resolveManagedSkillMetadataFilePath(chatSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "openai",
                    version: "0.0.3",
                }),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(captionSkillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "@private/vision",
                    version: "1.0.0",
                }),
            );

            const result = await sandbox.run([
                "skills",
                "sync",
                "upload",
                "--source",
                "registry",
                "--ignore",
                "@private/*,missing",
                "-i",
                "chat*",
            ], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const body = await request.json();

                    requests.push({ body });

                    return new Response(JSON.stringify(body));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("Uploaded 0 registry skills.\n");
            expect(requests[0]!.body).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects unsupported skill sync sources", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "skills",
                "sync",
                "upload",
                "--source",
                "local",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Invalid sync source: local. Use registry.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("applies uploaded registry skills using exact package versions", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const skillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const requests: Request[] = [];

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["skills", "sync", "apply"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    if (request.url === "https://cli-api.oomol.com/v1/skills") {
                        return new Response(JSON.stringify([
                            {
                                packageName: "openai",
                                skillName: "chatgpt",
                                version: "0.0.3",
                            },
                        ]));
                    }

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

                    if (isRegistryPackageDownloadCountRequest(request)) {
                        return new Response(null, { status: 204 });
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(`Installed skill chatgpt to ${skillDirectoryPath}.\n`);
            expect(result.stdout).toContain("Applied 1 uploaded registry skills.\n");
            expect(requests.map(request => request.url)).toContain(
                "https://registry.oomol.com/-/oomol/package-info/openai/0.0.3",
            );
            expect(requests.every(request =>
                request.headers.get("Authorization") === "secret-1",
            )).toBeTrue();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports download and install aliases for applying exact uploaded registry versions", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            for (const [alias, version] of [
                ["download", "0.0.4"],
                ["install", "0.0.5"],
            ] as const) {
                const skillName = `${alias}-skill`;
                const requests: Request[] = [];

                const result = await sandbox.run(["skills", "sync", alias], {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url === "https://cli-api.oomol.com/v1/skills") {
                            return new Response(JSON.stringify([
                                {
                                    packageName: "openai",
                                    skillName,
                                    version,
                                },
                            ]));
                        }

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                skills: [
                                    {
                                        description: `Install ${skillName}`,
                                        name: skillName,
                                        title: skillName,
                                    },
                                ],
                                version,
                            }));
                        }

                        if (request.url.endsWith(`/openai/-/meta/openai-${version}.tgz`)) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                [`package/package/skills/${skillName}/SKILL.md`]: `# ${skillName}\n`,
                            }));
                        }

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                });

                expect(result.exitCode).toBe(0);
                expect(result.stderr).toBe("");
                expect(result.stdout).toContain(`Applied 1 uploaded registry skills.\n`);
                expect(requests.map(request => request.url)).toContain(
                    `https://registry.oomol.com/-/oomol/package-info/openai/${version}`,
                );
                expect(requests.map(request => request.url)).toContain(
                    `https://registry.oomol.com/openai/-/meta/openai-${version}.tgz`,
                );
                expect(requests.every(request =>
                    request.headers.get("Authorization") === "secret-1",
                )).toBeTrue();
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a published registry skill into every existing supported host", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const hermesHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "hermes");
        const codeBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codebuddy");
        const workBuddyHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "workbuddy");
        const traeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae");
        const traeCnHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "trae-cn");
        const openClawHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "openclaw");
        const qoderWorkHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "qoderwork");
        const deepSeekTuiHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "deepseek-tui");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
        const hermesSkillDirectoryPath = join(hermesHomeDirectory, "skills", "chatgpt");
        const codeBuddySkillDirectoryPath = join(codeBuddyHomeDirectory, "skills", "chatgpt");
        const workBuddySkillDirectoryPath = join(workBuddyHomeDirectory, "skills", "chatgpt");
        const traeSkillDirectoryPath = join(traeHomeDirectory, "skills", "chatgpt");
        const traeCnSkillDirectoryPath = join(traeCnHomeDirectory, "skills", "chatgpt");
        const openClawSkillDirectoryPath = join(openClawHomeDirectory, "skills", "chatgpt");
        const qoderWorkSkillDirectoryPath = join(qoderWorkHomeDirectory, "skills", "chatgpt");
        const deepSeekTuiSkillDirectoryPath = join(deepSeekTuiHomeDirectory, "skills", "chatgpt");
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
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
                mkdir(hermesHomeDirectory, { recursive: true }),
                mkdir(codeBuddyHomeDirectory, { recursive: true }),
                mkdir(workBuddyHomeDirectory, { recursive: true }),
                mkdir(traeHomeDirectory, { recursive: true }),
                mkdir(traeCnHomeDirectory, { recursive: true }),
                mkdir(openClawHomeDirectory, { recursive: true }),
                mkdir(qoderWorkHomeDirectory, { recursive: true }),
                mkdir(deepSeekTuiHomeDirectory, { recursive: true }),
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                "Installed skill chatgpt to 10 agents: Universal, Claude Code, Hermes, CodeBuddy, WorkBuddy, Trae, Trae CN, OpenClaw, QoderWork, DeepSeek TUI.\n",
            );
            const canonicalSkillRealPath = await realpath(canonicalSkillDirectoryPath);

            for (const copiedSkillDirectoryPath of [
                universalSkillDirectoryPath,
                claudeSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
                deepSeekTuiSkillDirectoryPath,
            ]) {
                expect(await realpath(copiedSkillDirectoryPath)).not.toBe(
                    canonicalSkillRealPath,
                );
                expect((await lstat(copiedSkillDirectoryPath)).isSymbolicLink())
                    .toBeFalse();
            }

            for (const copiedSkillDirectoryPath of [
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
            ]) {
                expect(await realpath(copiedSkillDirectoryPath)).not.toBe(
                    canonicalSkillRealPath,
                );
                expect((await lstat(copiedSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
            }
            for (const skillDirectoryPath of [
                universalSkillDirectoryPath,
                claudeSkillDirectoryPath,
                hermesSkillDirectoryPath,
                codeBuddySkillDirectoryPath,
                workBuddySkillDirectoryPath,
                traeSkillDirectoryPath,
                traeCnSkillDirectoryPath,
                openClawSkillDirectoryPath,
                qoderWorkSkillDirectoryPath,
                deepSeekTuiSkillDirectoryPath,
            ]) {
                expect(await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                    "# ChatGPT",
                );
                expect(await readFile(
                    resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                    "utf8",
                )).toBe(
                    renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
                );
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("installs a published registry skill when only Claude Code is installed", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            // The universal host is always provisioned, so Claude Code is
            // installed alongside it.
            expect(result.stdout).toBe(
                "Installed skill chatgpt to 2 agents: Universal, Claude Code.\n",
            );
            await expectCopiedSkillDirectory(
                skillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
            await expectCopiedSkillDirectory(
                universalSkillDirectoryPath,
                canonicalSkillDirectoryPath,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not install a published registry skill over an unmanaged host target", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
            await expect(stat(universalSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("`--force` installs a published registry skill over an unmanaged host target", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const claudeSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeSkillDirectoryPath, { recursive: true }),
            ]);
            await Bun.write(join(claudeSkillDirectoryPath, "SKILL.md"), "# Existing\n");
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "install", "openai", "--skill", "chatgpt", "--force"],
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            // Unmanaged Claude target has been overwritten by the registry install.
            const claudeSkillMd = await readFile(
                join(claudeSkillDirectoryPath, "SKILL.md"),
                "utf8",
            );
            expect(claudeSkillMd).not.toBe("# Existing\n");
            expect(claudeSkillMd).toContain("# ChatGPT");
            expect(
                await readFile(
                    resolveManagedSkillMetadataFilePath(claudeSkillDirectoryPath),
                    "utf8",
                ),
            ).toBe(
                renderSkillMetadataJson(
                    createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" }),
                ),
            );
            // Universal target also receives the registry install through the same run.
            expect(
                await readFile(join(universalSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toContain("# ChatGPT");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects published registry skills that escape the local skills directory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const requests: Request[] = [];

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const selectedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const unselectedSkillDirectoryPath = join(universalHomeDirectory, "skills", "vision");
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
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

                    if (isRegistryPackageDownloadCountRequest(request)) {
                        return new Response(null, { status: 204 });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
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
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await mkdir(join(installedSkillDirectoryPath, "agents"), { recursive: true });
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
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

                    if (isRegistryPackageDownloadCountRequest(request)) {
                        return new Response(null, { status: 204 });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
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
            await mkdir(universalHomeDirectory, { recursive: true });
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const chatgptSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const visionSkillDirectoryPath = join(universalHomeDirectory, "skills", "vision");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
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

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
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
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const configDirectoryPath = join(storePaths.settingsFilePath, "..");
        const legacyBundledPath = join(configDirectoryPath, "skills", "oo");
        const legacyRegistryPath = join(configDirectoryPath, "skills", "chatgpt");
        const legacyClaudeRoot = join(configDirectoryPath, "claude-skills");
        const legacyOpenClawRoot = join(configDirectoryPath, "openclaw-skills");
        const newOoCanonicalPath = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(legacyBundledPath, { recursive: true });
            await Bun.write(
                resolveBundledSkillMetadataFilePath(legacyBundledPath),
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
            await expectCopiedSkillDirectory(
                ooSkillDirectoryPath,
                newOoCanonicalPath,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function expectCopiedSkillDirectory(
    skillDirectoryPath: string,
    canonicalSkillDirectoryPath: string,
): Promise<void> {
    expect(await realpath(skillDirectoryPath)).not.toBe(
        await realpath(canonicalSkillDirectoryPath),
    );
    expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
}

function createLocalSkillMarkdown(
    skillName: string,
    description: string,
    heading: string,
): string {
    return [
        "---",
        `name: ${skillName}`,
        `description: ${description}`,
        "---",
        "",
        `# ${heading}`,
        "",
    ].join("\n");
}

async function writeLocalSkillDirectory(
    skillDirectoryPath: string,
    skillMarkdown: string,
): Promise<void> {
    await mkdir(skillDirectoryPath, { recursive: true });
    await Bun.write(join(skillDirectoryPath, "SKILL.md"), skillMarkdown);
    await Bun.write(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(createLocalSkillMetadata()),
    );
}

function isRegistryPackageDownloadCountRequest(request: Request): boolean {
    return request.method === "POST"
        && request.url.includes("/-/oomol/packages/")
        && request.url.endsWith("/download-count");
}
