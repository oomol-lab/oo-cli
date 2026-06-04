import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
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
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skills update command", () => {
    test("skips bundled oo when no explicit skill names are provided", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooInstalledDirectoryPath = join(universalHomeDirectory, "skills", "oo");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const ooCanonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(ooCanonicalDirectoryPath, { recursive: true });
            await mkdir(ooInstalledDirectoryPath, { recursive: true });
            await Bun.write(join(ooCanonicalDirectoryPath, "SKILL.md"), "# oo\n");
            await Bun.write(join(ooInstalledDirectoryPath, "SKILL.md"), "# oo\n");
            await Bun.write(
                resolveManagedSkillMetadataFilePath(ooCanonicalDirectoryPath),
                renderSkillMetadataJson({ version: "1.0.0" }),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(ooInstalledDirectoryPath),
                renderSkillMetadataJson({ version: "1.0.0" }),
            );

            const result = await sandbox.run(["skills", "update"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("No updatable oo-managed skills were found.\n");
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records has_skill_filter on the text no-results path when --skill is given", async () => {
        const sandbox = await createCliSandbox();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            // A supported host exists but no registry skills are installed, so the
            // text path hits the no-results early return; has_skill_filter must
            // still be recorded.
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "update", "--skill", "nope"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("No updatable oo-managed skills were found.\n");
            expect(parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            )).toMatchObject({
                properties: {
                    command_full: "skills.update",
                    has_skill_filter: true,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects the bundled oo skill as an explicit update target", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "update", "oo"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Bundled skill oo is managed by oo and cannot be updated with skills update. Use oo skills add oo instead.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects the bundled oo-find-skills skill as an explicit update target", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "update", "oo-find-skills"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Bundled skill oo-find-skills is managed by oo and cannot be updated with skills update. Use oo skills add oo-find-skills instead.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("ignores installed skills with unparseable metadata when updating all skills", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeUnparseableManagedSkillInstallation(installedSkillDirectoryPath);

            const result = await sandbox.run(["skills", "update"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("No updatable oo-managed skills were found.\n");
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports package-not-installed when no installed skill belongs to the package", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);

            const result = await sandbox.run(["skills", "update", "aaa"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "No installed oo-managed skill belongs to package aaa.\n",
            );
            expect(result.stderr).not.toContain(universalHomeDirectory);
            expect(result.stderr).not.toContain(claudeHomeDirectory);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports package-not-installed when the only same-name directory has unparseable metadata", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeUnparseableManagedSkillInstallation(installedSkillDirectoryPath);

            // A directory with unparseable metadata is not a managed registry
            // skill, so no package resolves to it.
            const result = await sandbox.run(["skills", "update", "chatgpt"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "No installed oo-managed skill belongs to package chatgpt.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates a published managed skill to the latest version", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const universalInstalledSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const claudeInstalledSkillDirectoryPath = join(claudeHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: universalInstalledSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });
            await mkdir(claudeInstalledSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(claudeInstalledSkillDirectoryPath, "SKILL.md"),
                "# ChatGPT stale\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(claudeInstalledSkillDirectoryPath),
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.3" })),
            );

            const result = await sandbox.run(
                ["skills", "update", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.4",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
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
                [
                    `Updated skill chatgpt to ${universalInstalledSkillDirectoryPath}.`,
                    `Updated skill chatgpt to ${claudeInstalledSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            )).toMatchObject({
                properties: {
                    command_full: "skills.update",
                    has_skill_filter: false,
                    package_kind: "registry",
                    package_name: "openai",
                    package_names_count_bucket: "1-5",
                    package_names_sample: ["openai"],
                    package_names_truncated: false,
                    skill_ids_count_bucket: "1-5",
                    skill_ids_sample: ["chatgpt"],
                    skill_ids_truncated: false,
                },
            });
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(universalInstalledSkillDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })));
            expect(await readFile(join(universalInstalledSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "# ChatGPT fresh",
            );
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(claudeInstalledSkillDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })));
            expect(await readFile(join(claudeInstalledSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "# ChatGPT fresh",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates a published managed skill by copying to the host target", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const hermesHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "hermes");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const universalInstalledSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const installedSkillDirectoryPath = join(hermesHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(hermesHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });

            const result = await sandbox.run(
                ["skills", "update", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.4",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
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
            // The universal host is always provisioned, so the skill is also
            // copied into ~/.agents in addition to the hermes host target.
            expect(result.stdout).toBe(
                [
                    `Updated skill chatgpt to ${universalInstalledSkillDirectoryPath}.`,
                    `Updated skill chatgpt to ${installedSkillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(await realpath(installedSkillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(installedSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })));
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "# ChatGPT fresh",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates a host target when canonical metadata is already current", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })),
            );

            const result = await sandbox.run(
                ["skills", "update", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.4",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
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
                `Updated skill chatgpt to ${installedSkillDirectoryPath}.\n`,
            );
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })));
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "# ChatGPT fresh",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates published skills in parallel", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const chatgptCanonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const claudeCanonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "claude",
        );
        const chatgptInstalledDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const claudeInstalledDirectoryPath = join(universalHomeDirectory, "skills", "claude");
        let tarballRequestCount = 0;
        let releaseTarballs: (() => void) | undefined;
        const tarballGate = new Promise<void>((resolve) => {
            releaseTarballs = resolve;
        });

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath: chatgptCanonicalDirectoryPath,
                installedSkillDirectoryPath: chatgptInstalledDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath: claudeCanonicalDirectoryPath,
                installedSkillDirectoryPath: claudeInstalledDirectoryPath,
                packageName: "anthropic",
                skillMarkdown: "# Claude stale\n",
                version: "0.1.0",
            });

            const resultPromise = sandbox.run(
                ["skills", "update", "openai", "anthropic"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/openai/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.4",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.includes("/package-info/anthropic/")) {
                            return new Response(JSON.stringify({
                                packageName: "anthropic",
                                version: "0.1.1",
                                skills: [
                                    {
                                        description: "Chat with Claude",
                                        name: "claude",
                                        title: "Claude",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                            tarballRequestCount += 1;

                            if (tarballRequestCount === 2) {
                                releaseTarballs?.();
                            }

                            await tarballGate;

                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
                            }));
                        }

                        if (request.url.endsWith("/anthropic/-/meta/anthropic-0.1.1.tgz")) {
                            tarballRequestCount += 1;

                            if (tarballRequestCount === 2) {
                                releaseTarballs?.();
                            }

                            await tarballGate;

                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/claude/SKILL.md": "# Claude fresh\n",
                            }));
                        }

                        if (isRegistryPackageDownloadCountRequest(request)) {
                            return new Response(null, { status: 204 });
                        }

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            const racedResult = await Promise.race([
                resultPromise,
                Bun.sleep(500).then(() => "timeout" as const),
            ]);

            expect(racedResult).not.toBe("timeout");
            expect(tarballRequestCount).toBe(2);

            const result = racedResult as Awaited<typeof resultPromise>;

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates every installed skill that belongs to the selected package", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const chatgptCanonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const visionCanonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "vision",
        );
        const chatgptInstalledDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const visionInstalledDirectoryPath = join(universalHomeDirectory, "skills", "vision");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath: chatgptCanonicalDirectoryPath,
                installedSkillDirectoryPath: chatgptInstalledDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath: visionCanonicalDirectoryPath,
                installedSkillDirectoryPath: visionInstalledDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# Vision stale\n",
                version: "0.0.3",
            });

            const result = await sandbox.run(
                ["skills", "update", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.4",
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

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
                                "package/package/skills/vision/SKILL.md": "# Vision fresh\n",
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
            // Both skills of package openai are updated together to the latest
            // version, not just one.
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(chatgptInstalledDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })));
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(visionInstalledDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "openai", version: "0.0.4" })));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("de-duplicates a repeated package argument in text mode", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });

            const result = await sandbox.run(
                ["skills", "update", "openai", "openai"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "openai",
                                version: "0.0.4",
                                skills: [
                                    {
                                        description: "Chat with a model",
                                        name: "chatgpt",
                                        title: "ChatGPT",
                                    },
                                ],
                            }));
                        }

                        if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                            return new Response(await createRegistrySkillArchiveBytes({
                                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
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
            // The repeated "openai" is processed once: exactly one update line.
            expect(result.stdout).toBe(
                `Updated skill chatgpt to ${installedSkillDirectoryPath}.\n`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports a per-skill failure line and exits non-zero when package info fails in text mode", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });

            const result = await sandbox.run(
                ["skills", "update", "openai"],
                {
                    // The package-info lookup is the first network call; failing
                    // it drives the group-level failure fan-out.
                    fetcher: async () => new Response("err", { status: 500 }),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain("Failed to update skill chatgpt:");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders interactive progress while updating skills", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();
        let releaseTarball = () => {};
        let execution: Promise<number> | undefined;
        const tarballGate = new Promise<void>((resolve) => {
            // Build the gate before starting the CLI so releasing it cannot race
            // the tarball request setting its resolver.
            releaseTarball = resolve;
        });

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });

            execution = executeCli({
                argv: ["skills", "update", "openai"],
                cwd: sandbox.cwd,
                env: sandbox.env,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    if (request.url.includes("/package-info/")) {
                        return new Response(JSON.stringify({
                            packageName: "openai",
                            version: "0.0.4",
                            skills: [
                                {
                                    description: "Chat with a model",
                                    name: "chatgpt",
                                    title: "ChatGPT",
                                },
                            ],
                        }));
                    }

                    if (request.url.endsWith("/openai/-/meta/openai-0.0.4.tgz")) {
                        await tarballGate;

                        return new Response(await createRegistrySkillArchiveBytes({
                            "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
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

            await waitForOutputText(stdout, "Updating installed skills");
            await waitForOutputText(stdout, "chatgpt");

            releaseTarball();

            const exitCode = await execution;
            const plainOutput = stripVTControlCharacters(stdout.read());

            expect(exitCode).toBe(0);
            expect(stderr.read()).toBe("");
            expect(plainOutput).toContain("Updating installed skills");
            expect(plainOutput).toContain("chatgpt");
            expect(plainOutput).toContain("updated");
        }
        finally {
            releaseTarball();
            if (execution !== undefined) {
                await Promise.race([
                    execution.then(() => undefined, () => undefined),
                    Bun.sleep(1000),
                ]);
            }
            await sandbox.cleanup();
        }
    });

    test("does not consume legacy bundled metadata as a registry update target", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(universalHomeDirectory, "skills", "custom");
        const claudeInstalledSkillDirectoryPath = join(claudeHomeDirectory, "skills", "custom");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "custom",
        );

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await mkdir(installedSkillDirectoryPath, { recursive: true });
            await mkdir(claudeInstalledSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                "# Custom\n",
            );
            await Bun.write(
                join(installedSkillDirectoryPath, "SKILL.md"),
                "# Custom\n",
            );
            await Bun.write(
                join(claudeInstalledSkillDirectoryPath, "SKILL.md"),
                "# Custom\n",
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath),
                renderSkillMetadataJson({ version: "1.0.0" }),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
                renderSkillMetadataJson({ version: "1.0.0" }),
            );
            await Bun.write(
                resolveManagedSkillMetadataFilePath(claudeInstalledSkillDirectoryPath),
                renderSkillMetadataJson({ version: "1.0.0" }),
            );

            const result = await sandbox.run(["skills", "update", "custom"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "No installed oo-managed skill belongs to package custom.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function writeManagedRegistrySkillInstallation(options: {
    canonicalSkillDirectoryPath: string;
    installedSkillDirectoryPath: string;
    packageName: string;
    skillMarkdown: string;
    version: string;
}): Promise<void> {
    await mkdir(options.canonicalSkillDirectoryPath, { recursive: true });
    await mkdir(options.installedSkillDirectoryPath, { recursive: true });
    await Bun.write(
        join(options.canonicalSkillDirectoryPath, "SKILL.md"),
        options.skillMarkdown,
    );
    await Bun.write(
        join(options.installedSkillDirectoryPath, "SKILL.md"),
        options.skillMarkdown,
    );
    await Bun.write(
        resolveManagedSkillMetadataFilePath(options.canonicalSkillDirectoryPath),
        renderSkillMetadataJson(createRegistrySkillMetadata({
            packageName: options.packageName,
            version: options.version,
        })),
    );
    await Bun.write(
        resolveManagedSkillMetadataFilePath(options.installedSkillDirectoryPath),
        renderSkillMetadataJson(createRegistrySkillMetadata({
            packageName: options.packageName,
            version: options.version,
        })),
    );
}

async function writeUnparseableManagedSkillInstallation(
    skillDirectoryPath: string,
): Promise<void> {
    await mkdir(skillDirectoryPath, { recursive: true });
    await Bun.write(join(skillDirectoryPath, "SKILL.md"), "# Broken\n");
    await Bun.write(resolveManagedSkillMetadataFilePath(skillDirectoryPath), "{\n");
}

function isRegistryPackageDownloadCountRequest(request: Request): boolean {
    return request.method === "POST"
        && request.url.includes("/-/oomol/packages/")
        && request.url.endsWith("/download-count");
}
