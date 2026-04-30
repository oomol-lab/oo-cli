import type { CliCatalog, CliExecutionContext, Fetcher } from "../../contracts/cli.ts";

import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import matter from "gray-matter";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createCliSandbox,
    createInteractiveInput,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTemporaryDirectory,
    createTextBuffer,
    toRequest,
    useTemporaryDirectoryCleanup,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { defaultSettings } from "../../schemas/settings.ts";
import { resolveCodexHomeDirectory } from "./bundled-skill-paths.ts";
import { resolveLocalSkillCanonicalDirectoryPath } from "./managed-skill-paths.ts";
import { publishLocalSkillPackage } from "./publish.ts";

const emptyCatalog: CliCatalog = {
    name: "oo",
    descriptionKey: "app.description",
    globalOptions: [],
    commands: [],
};

describe("skills publish command", () => {
    const cleanup = useTemporaryDirectoryCleanup();

    test("publishes a canonical local skill through the CLI", async () => {
        const { sandbox, skillDirectoryPath } = await createCliPublishSkillSandbox(
            "demo-skill",
            [
                "---",
                "name: demo-skill",
                "description: Use a known package workflow.",
                "---",
                "",
                "# Demo Skill",
                "",
            ].join("\n"),
        );

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "publish", "demo-skill"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/-/oomol/package-info/")) {
                            return new Response("not found", { status: 404 });
                        }

                        return new Response("", { status: 201 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Published skill demo-skill as private package @alice/demo-skill@0.0.1. View it at https://hub.oomol.com/package/@alice/demo-skill.\n",
            );
            expect(result.stderr).toBe("");
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40alice%2Fdemo-skill/latest?lang=en",
                "PUT https://registry.oomol.com/@alice%2fdemo-skill",
            ]);
            expect(requests[1]?.headers.get("Authorization")).toBe("secret-1");
            await expect(requests[1]!.json()).resolves.toMatchObject({
                access: "restricted",
            });

            const parsed = matter(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                packageName: "@alice/demo-skill",
                version: "0.0.1",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("publishes public package metadata when visibility is public", async () => {
        const { sandbox } = await createCliPublishSkillSandbox(
            "public-skill",
            [
                "---",
                "name: public-skill",
                "description: Use a known package workflow.",
                "---",
                "",
            ].join("\n"),
            {
                auth: {
                    accounts: [
                        {
                            apiKey: "secret-1",
                            endpoint: "example.test",
                            id: "user-1",
                            name: "Alice",
                        },
                    ],
                },
            },
        );

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "publish", "public-skill", "--visibility", "public"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/-/oomol/package-info/")) {
                            return new Response("not found", { status: 404 });
                        }

                        return new Response("", { status: 201 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Published skill public-skill as public package @alice/public-skill@0.0.1. View it at https://hub.example.test/package/@alice/public-skill.\n",
            );
            await expect(requests[1]!.json()).resolves.toMatchObject({
                access: "public",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("increments the final version from latest package info", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-remote-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath, {
            fetcher: async () => new Response(JSON.stringify({
                blocks: [],
                description: "Previous skill package",
                packageName: "@alice/versioned-skill",
                packageVersion: "0.0.3",
                title: "Versioned Skill",
            })),
        });
        const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "versioned-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: versioned-skill",
            "description: Use a known package workflow.",
            "metadata:",
            "  version: '0.0.2'",
            "---",
            "",
        ].join("\n"));

        const result = await publishLocalSkillPackage(
            "versioned-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                publishConvertedSkillPackage: () => Promise.resolve(),
            },
        );

        expect(result.version).toBe("0.0.4");

        const parsed = matter(
            await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toMatchObject({
            packageName: "@alice/versioned-skill",
            version: "0.0.4",
        });
    });

    test("continues publishing over a remote package with blocks after confirmation", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-blocks-confirm-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const promptOutput = createTextBuffer();
        const context = createPublishContext(settingsFilePath, {
            fetcher: async () => new Response(JSON.stringify({
                blocks: [
                    {
                        blockName: "main",
                        inputHandleDefs: [],
                        outputHandleDefs: [],
                    },
                ],
                description: "Remote block package",
                packageName: "@alice/blocked-skill",
                packageVersion: "1.2.3",
                title: "Blocked Skill",
            })),
            stdin,
            stdout: promptOutput.writer,
        });
        const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "blocked-skill",
        );
        let publishCalled = false;

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: blocked-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        stdin.feed("yes\n");

        const result = await publishLocalSkillPackage(
            "blocked-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                publishConvertedSkillPackage: () => {
                    publishCalled = true;

                    return Promise.resolve();
                },
            },
        );

        expect(result.version).toBe("1.2.4");
        expect(publishCalled).toBeTrue();
        expect(promptOutput.read()).toBe(
            "Remote package @alice/blocked-skill@1.2.3 contains blocks. Continue publishing skill blocked-skill as @alice/blocked-skill? [y/N] ",
        );

        const parsed = matter(
            await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toMatchObject({
            packageName: "@alice/blocked-skill",
            version: "1.2.4",
        });
    });

    test("rejects publishing over a remote package with blocks when confirmation is declined", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-blocks-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const context = createPublishContext(settingsFilePath, {
            fetcher: async () => new Response(JSON.stringify({
                blocks: [
                    {
                        blockName: "main",
                        inputHandleDefs: [],
                        outputHandleDefs: [],
                    },
                ],
                description: "Remote block package",
                packageName: "@alice/blocked-skill",
                packageVersion: "1.2.3",
                title: "Blocked Skill",
            })),
            stdin,
        });
        const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "blocked-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: blocked-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        stdin.feed("no\n");

        await expect(publishLocalSkillPackage(
            "blocked-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                convertSkillDirectoryToPackage: () => {
                    throw new Error("Conversion should not run.");
                },
                publishConvertedSkillPackage: () => Promise.resolve(),
            },
        )).rejects.toMatchObject({
            key: "errors.skills.publish.remotePackageHasBlocks",
            params: {
                name: "blocked-skill",
                packageName: "@alice/blocked-skill",
                version: "1.2.3",
            },
        });

        const parsed = matter(
            await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toBeUndefined();
    });

    test("requires an interactive confirmation when a remote package has blocks", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-blocks-non-interactive-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath, {
            fetcher: async () => new Response(JSON.stringify({
                blocks: [
                    {
                        blockName: "main",
                        inputHandleDefs: [],
                        outputHandleDefs: [],
                    },
                ],
                description: "Remote block package",
                packageName: "@alice/blocked-skill",
                packageVersion: "1.2.3",
                title: "Blocked Skill",
            })),
            stdin: createNonInteractiveInput(),
        });
        const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "blocked-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: blocked-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        await expect(publishLocalSkillPackage(
            "blocked-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                convertSkillDirectoryToPackage: () => {
                    throw new Error("Conversion should not run.");
                },
                publishConvertedSkillPackage: () => Promise.resolve(),
            },
        )).rejects.toMatchObject({
            key: "errors.skills.publish.remotePackageHasBlocksConfirmationRequired",
            params: {
                name: "blocked-skill",
                packageName: "@alice/blocked-skill",
                version: "1.2.3",
            },
        });
    });

    test("uses the injected final version and removes the temporary package root", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-config");
        const temporaryPackageRoot = await createTemporaryDirectory("publish-package");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "versioned-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: versioned-skill",
            "description: Use a known package workflow.",
            "metadata:",
            "  version: '0.0.3'",
            "---",
            "",
        ].join("\n"));

        const result = await publishLocalSkillPackage(
            "versioned-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                createTemporaryPackageRoot: () => Promise.resolve(temporaryPackageRoot),
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(
                    request.requestedVersion === "0.0.3" ? "0.0.4" : "0.0.1",
                ),
            },
        );

        expect(result).toMatchObject({
            hubUrl: "https://hub.oomol.com/package/@alice/versioned-skill",
            packageName: "@alice/versioned-skill",
            skillDirectoryPath,
            skillId: "versioned-skill",
            version: "0.0.4",
        });
        await expect(stat(temporaryPackageRoot)).rejects.toMatchObject({
            code: "ENOENT",
        });

        const parsed = matter(
            await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toMatchObject({
            packageName: "@alice/versioned-skill",
            version: "0.0.4",
        });
    });

    test("does not write local metadata when publishing fails", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-fail-config");
        const temporaryPackageRoot = await createTemporaryDirectory("publish-fail-package");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "failing-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: failing-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        await expect(publishLocalSkillPackage(
            "failing-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                createTemporaryPackageRoot: () => Promise.resolve(temporaryPackageRoot),
                publishConvertedSkillPackage: () => Promise.reject(new Error("publish failed")),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        )).rejects.toThrow("publish failed");
        await expect(stat(temporaryPackageRoot)).rejects.toMatchObject({
            code: "ENOENT",
        });

        const parsed = matter(
            await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toBeUndefined();
    });

    test("rejects a missing canonical local skill directory", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-missing-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);

        cleanup.track(configRootDirectoryPath);

        await expect(publishLocalSkillPackage(
            "missing-skill",
            context,
            "private",
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
            },
        )).rejects.toMatchObject({
            key: "errors.skills.publish.localSkillMissing",
        });
    });
});

async function createCliPublishSkillSandbox(
    skillId: string,
    skillMarkdown: string,
    options: {
        auth?: Parameters<typeof writeAuthFile>[1];
    } = {},
) {
    const sandbox = await createCliSandbox();
    const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: sandbox.env,
        platform: process.platform,
    });
    const skillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        storePaths.settingsFilePath,
        skillId,
    );

    await mkdir(codexHomeDirectory, { recursive: true });
    await writeAuthFile(sandbox, options.auth);
    await writeSkillFile(skillDirectoryPath, skillMarkdown);

    return {
        sandbox,
        skillDirectoryPath,
    };
}

function createPublishContext(
    settingsFilePath: string,
    options: {
        fetcher?: Fetcher;
        stdin?: CliExecutionContext["stdin"];
        stdout?: CliExecutionContext["stdout"];
    } = {},
): CliExecutionContext {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();
    const settingsStore = {
        ...createSettingsStore(defaultSettings),
        getFilePath: () => settingsFilePath,
    };

    return {
        authStore: createAuthStore({
            auth: [
                {
                    apiKey: "secret",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        }),
        cacheStore: createCacheStore(),
        currentLogFilePath: "",
        execPath: process.execPath,
        fetcher: options.fetcher
            ?? (() => Promise.reject(new Error("Unexpected fetch."))),
        cwd: process.cwd(),
        env: {},
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        stdin: options.stdin ?? createInteractiveInput(),
        logger: pino({
            enabled: false,
        }),
        packageName: "@oomol-lab/oo-cli",
        settingsStore,
        stdout: options.stdout ?? stdout.writer,
        stderr: stderr.writer,
        translator: createTranslator("en"),
        completionRenderer: {
            render: () => "",
        },
        catalog: emptyCatalog,
        version: "0.1.0",
    };
}

function createNonInteractiveInput(): CliExecutionContext["stdin"] {
    return {
        isTTY: false,
        off() {},
        on() {},
    };
}

async function writeSkillFile(
    directoryPath: string,
    content: string,
): Promise<void> {
    await mkdir(directoryPath, { recursive: true });
    await Bun.write(join(directoryPath, "SKILL.md"), content);
}
