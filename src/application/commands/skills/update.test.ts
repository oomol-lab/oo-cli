import { mkdir, readFile } from "node:fs/promises";
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
import { resolveCodexHomeDirectory } from "./bundled-skill-paths.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

describe("skills update command", () => {
    test("skips bundled oo when no explicit skill names are provided", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const ooInstalledDirectoryPath = join(codexHomeDirectory, "skills", "oo");
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
            await mkdir(codexHomeDirectory, { recursive: true });
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

    test("rejects the bundled oo skill as an explicit update target", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "update", "oo"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Codex skill oo is synchronized automatically and cannot be updated with skills update.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates a published managed skill to the latest version", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });

            const result = await sandbox.run(
                ["skills", "update", "chatgpt"],
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

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                `Updated Codex skill chatgpt to ${installedSkillDirectoryPath}.\n`,
            );
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson({ packageName: "openai", version: "0.0.4" }));
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
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
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
        const chatgptInstalledDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const claudeInstalledDirectoryPath = join(codexHomeDirectory, "skills", "claude");
        let tarballRequestCount = 0;
        let releaseTarballs: (() => void) | undefined;
        const tarballGate = new Promise<void>((resolve) => {
            releaseTarballs = resolve;
        });

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
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
                ["skills", "update", "chatgpt", "claude"],
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

    test("updates only the selected skills", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
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
        const chatgptInstalledDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const visionInstalledDirectoryPath = join(codexHomeDirectory, "skills", "vision");

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
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
                ["skills", "update", "chatgpt"],
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

                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(chatgptInstalledDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson({ packageName: "openai", version: "0.0.4" }));
            expect(await readFile(
                resolveManagedSkillMetadataFilePath(visionInstalledDirectoryPath),
                "utf8",
            )).toBe(renderSkillMetadataJson({ packageName: "openai", version: "0.0.3" }));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders interactive progress while updating skills", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(codexHomeDirectory, "skills", "chatgpt");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "chatgpt",
        );
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();
        let releaseTarball: (() => void) | undefined;

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeManagedRegistrySkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                packageName: "openai",
                skillMarkdown: "# ChatGPT stale\n",
                version: "0.0.3",
            });

            const execution = executeCli({
                argv: ["skills", "update", "chatgpt"],
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
                        await new Promise<void>((resolve) => {
                            releaseTarball = resolve;
                        });

                        return new Response(await createRegistrySkillArchiveBytes({
                            "package/package/skills/chatgpt/SKILL.md": "# ChatGPT fresh\n",
                        }));
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

            releaseTarball?.();

            const exitCode = await execution;
            const plainOutput = stripVTControlCharacters(stdout.read());

            expect(exitCode).toBe(0);
            expect(stderr.read()).toBe("");
            expect(plainOutput).toContain("Updating installed skills");
            expect(plainOutput).toContain("chatgpt");
            expect(plainOutput).toContain("updated");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails when a non-bundled managed skill is missing package metadata", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const installedSkillDirectoryPath = join(codexHomeDirectory, "skills", "custom");
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "custom",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await mkdir(installedSkillDirectoryPath, { recursive: true });
            await Bun.write(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                "# Custom\n",
            );
            await Bun.write(
                join(installedSkillDirectoryPath, "SKILL.md"),
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

            const result = await sandbox.run(["skills", "update", "custom"]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe(
                "Failed to update Codex skill custom: Managed skill custom cannot be updated because its package metadata is missing.\n",
            );
            expect(result.stderr).toBe(
                "Managed skill custom cannot be updated because its package metadata is missing.\n",
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
        renderSkillMetadataJson({ packageName: options.packageName, version: options.version }),
    );
    await Bun.write(
        resolveManagedSkillMetadataFilePath(options.installedSkillDirectoryPath),
        renderSkillMetadataJson({ packageName: options.packageName, version: options.version }),
    );
}
