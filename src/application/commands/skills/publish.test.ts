import type { CliCatalog, CliExecutionContext, Fetcher } from "../../contracts/cli.ts";

import { lstat, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

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
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { createSymbolicLinkForTest } from "./__tests__/helpers.ts";
import {
    resolveClaudeHomeDirectory,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    resolveLocalSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { publishLocalSkillPackage, publishSkillPackage } from "./publish.ts";
import { parseSkillMarkdownMatter } from "./skill-frontmatter.ts";
import {
    createLocalSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

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
            const stdin = createInteractiveInput();
            const requests: Request[] = [];
            stdin.feed("private\n");
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
                    stdin,
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Publish skill demo-skill as package @alice/demo-skill with which visibility? [private/public] Published skill demo-skill as private package @alice/demo-skill@0.0.1. View it at https://hub.oomol.com/package/@alice/demo-skill.\n",
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

            const parsed = parseSkillMarkdownMatter(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                packageName: "@alice/demo-skill",
                version: "0.0.1",
            });
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    adopted: false,
                    command_full: "skills.publish",
                    package_name: "@alice/demo-skill",
                    skill_id: "demo-skill",
                    source_kind: "local",
                    visibility: "private",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails before publishing when a local agent copy has drifted", async () => {
        const skillId = "drifted-skill";
        const { sandbox, skillDirectoryPath } = await createCliPublishSkillSandbox(
            skillId,
            [
                "---",
                `name: ${skillId}`,
                "description: Use the canonical workflow.",
                "---",
                "",
                "# Canonical",
                "",
            ].join("\n"),
        );
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const agentSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            skillId,
        );
        const requests: Request[] = [];

        try {
            await writeSkillFile(agentSkillDirectoryPath, [
                "---",
                `name: ${skillId}`,
                "description: Use the drifted workflow.",
                "---",
                "",
                "# Agent",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(agentSkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(
                ["skills", "publish", skillId, "--visibility", "private"],
                {
                    fetcher: (input, init) => {
                        requests.push(toRequest(input, init));
                        return Promise.resolve(new Response("", { status: 201 }));
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                `Local skill ${skillId} has modified agent copies at ${agentSkillDirectoryPath}. Publishing uses canonical storage at ${skillDirectoryPath}; pass --force to ignore agent-side changes.\n`,
            );
            expect(requests).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("publishes canonical local content with --force when a local agent copy has drifted", async () => {
        const skillId = "force-drifted-skill";
        const { sandbox, skillDirectoryPath } = await createCliPublishSkillSandbox(
            skillId,
            [
                "---",
                `name: ${skillId}`,
                "description: Use the canonical workflow.",
                "---",
                "",
                "# Canonical",
                "",
            ].join("\n"),
        );
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const agentSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            skillId,
        );
        const requests: Request[] = [];

        try {
            await writeSkillFile(agentSkillDirectoryPath, [
                "---",
                `name: ${skillId}`,
                "description: Use the drifted workflow.",
                "---",
                "",
                "# Agent",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(agentSkillDirectoryPath),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run(
                ["skills", "publish", skillId, "--visibility", "private", "--force"],
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
            expect(result.stdout).toContain(
                `Published skill ${skillId} as private package @alice/${skillId}@0.0.1.`,
            );
            expect(result.stderr).toBe(
                `Warning: Local skill ${skillId} has modified agent copies at ${agentSkillDirectoryPath}; publishing canonical storage at ${skillDirectoryPath} and ignoring agent-side changes.\n`,
            );
            expect(requests.map(request => request.method)).toEqual(["GET", "PUT"]);
            expect(
                await readFile(join(agentSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toContain("# Agent");
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

    test("preserves public visibility from an existing package", async () => {
        const { sandbox } = await createCliPublishSkillSandbox(
            "existing-public-skill",
            [
                "---",
                "name: existing-public-skill",
                "description: Use a known package workflow.",
                "---",
                "",
            ].join("\n"),
        );

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "publish", "existing-public-skill"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.includes("/-/oomol/package-info/")) {
                            return new Response(JSON.stringify({
                                access: "public",
                                blocks: [],
                                description: "Existing public skill package.",
                                packageName: "@alice/existing-public-skill",
                                packageVersion: "0.0.3",
                                title: "Existing Public Skill",
                            }));
                        }

                        return new Response("", { status: 201 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Published skill existing-public-skill as public package @alice/existing-public-skill@0.0.4. View it at https://hub.oomol.com/package/@alice/existing-public-skill.\n",
            );
            await expect(requests[1]!.json()).resolves.toMatchObject({
                access: "public",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("publishes a registry skill when the installed package matches the target package", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "registry-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: registry-skill",
                "description: Use a registry package workflow.",
                "metadata:",
                "  version: '0.2.0'",
                "---",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "@alice/registry-skill",
                    version: "0.1.0",
                }),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "publish", "registry-skill", "--visibility", "private"],
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
                "Published skill registry-skill as private package @alice/registry-skill@0.2.0. View it at https://hub.oomol.com/package/@alice/registry-skill.\n",
            );
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40alice%2Fregistry-skill/latest?lang=en",
                "PUT https://registry.oomol.com/@alice%2fregistry-skill",
            ]);

            const parsed = parseSkillMarkdownMatter(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                packageName: "@alice/registry-skill",
                version: "0.2.0",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("confirms before publishing a registry skill from a different package", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-registry-mismatch-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const promptOutput = createTextBuffer();
        const context = createPublishContext(settingsFilePath, {
            stdin,
            stdout: promptOutput.writer,
        });
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            settingsFilePath,
            "forked-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: forked-skill",
            "description: Use a registry package workflow.",
            "---",
            "",
        ].join("\n"));
        await Bun.write(
            resolveManagedSkillMetadataFilePath(skillDirectoryPath),
            renderSkillMetadataJson({
                packageName: "@bob/forked-skill",
                version: "0.1.0",
            }),
        );

        stdin.feed("yes\n");

        const result = await publishSkillPackage(
            "forked-skill",
            context,
            "private",
            {},
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result.packageName).toBe("@alice/forked-skill");
        expect(promptOutput.read()).toBe(
            "Skill forked-skill is installed from @bob/forked-skill. Publish it as @alice/forked-skill? [y/N] ",
        );
    });

    test("publishes a registry skill from a different package when --yes is passed", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "forked-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: forked-skill",
                "description: Use a registry package workflow.",
                "---",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                renderSkillMetadataJson({
                    packageName: "@bob/forked-skill",
                    version: "0.1.0",
                }),
            );

            const result = await sandbox.run(
                ["skills", "publish", "forked-skill", "--yes", "--visibility", "private"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/-/oomol/package-info/")) {
                            return new Response("not found", { status: 404 });
                        }

                        return new Response("", { status: 201 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                "Published skill forked-skill as private package @alice/forked-skill@0.0.1. View it at https://hub.oomol.com/package/@alice/forked-skill.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("adopts an agent skill before publishing it", async () => {
        const sandbox = await createCliSandbox();
        const stdin = createInteractiveInput();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const agentSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "agent-skill",
        );
        const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "agent-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);
            await writeSkillFile(agentSkillDirectoryPath, [
                "---",
                "name: agent-skill",
                "description: Use an agent-local workflow.",
                "---",
                "",
            ].join("\n"));
            await Bun.write(
                resolveManagedSkillMetadataFilePath(agentSkillDirectoryPath),
                renderSkillMetadataJson({
                    icon: ":sparkles:",
                    packageName: "@bob/agent-skill",
                    version: "0.3.0",
                }),
            );

            stdin.feed("yes\n");

            const result = await sandbox.run(
                ["skills", "publish", "agent-skill", "--agent", "codex", "--visibility", "private"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/-/oomol/package-info/")) {
                            return new Response("not found", { status: 404 });
                        }

                        return new Response("", { status: 201 });
                    },
                    stdin,
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                `Adopted skill agent-skill into local canonical storage at ${localSkillDirectoryPath}.\n`,
            );
            expect(result.stdout).toContain(
                "Published skill agent-skill as private package @alice/agent-skill@0.3.0.",
            );
            expect(await readFile(resolveManagedSkillMetadataFilePath(localSkillDirectoryPath), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const parsed = parseSkillMarkdownMatter(
                await readFile(join(localSkillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                icon: ":sparkles:",
                packageName: "@alice/agent-skill",
                version: "0.3.0",
            });
            expect((await lstat(agentSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    adopted: true,
                    command_full: "skills.publish",
                    package_name: "@alice/agent-skill",
                    skill_id: "agent-skill",
                    source_kind: "adoptable",
                    visibility: "private",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("adopts a skill from a relative path before publishing it", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-path-config");
        const cwd = await createTemporaryDirectory("publish-path-cwd");
        const codexHomeDirectory = await createTemporaryDirectory("publish-path-codex");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const context = createPublishContext(settingsFilePath, { stdin });
        const sourceSkillDirectoryPath = join(cwd, "path-skill");
        const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "path-skill",
        );

        cleanup.track(configRootDirectoryPath);
        cleanup.track(cwd);
        cleanup.track(codexHomeDirectory);

        context.cwd = cwd;
        context.env = {
            CODEX_HOME: codexHomeDirectory,
            HOME: configRootDirectoryPath,
            USERPROFILE: configRootDirectoryPath,
        };

        await writeSkillFile(sourceSkillDirectoryPath, [
            "---",
            "name: path-skill",
            "description: Use a path-local workflow.",
            "---",
            "",
        ].join("\n"));

        stdin.feed("yes\n");

        const result = await publishSkillPackage(
            "./path-skill",
            context,
            "private",
            {},
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 1,
                }),
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result).toMatchObject({
            packageName: "@alice/path-skill",
            skillDirectoryPath: localSkillDirectoryPath,
            skillId: "path-skill",
            version: "0.0.1",
        });
        await expect(stat(sourceSkillDirectoryPath)).rejects.toMatchObject({
            code: "ENOENT",
        });
        await expect(stat(join(codexHomeDirectory, "skills", "path-skill")))
            .resolves
            .toMatchObject({
                isDirectory: expect.any(Function),
            });
    });

    test("rejects adopting a skill directory that contains symlinks", async () => {
        const cases = [
            {
                linkKind: "file",
                linkPath: join("nested", "linked-secret.txt"),
                name: "file",
            },
            {
                linkKind: "directory",
                linkPath: join("nested", "linked-secret"),
                name: "directory",
            },
        ] as const;

        for (const testCase of cases) {
            const configRootDirectoryPath = await createTemporaryDirectory(
                `publish-adopt-symlink-${testCase.name}-config`,
            );
            const cwd = await createTemporaryDirectory(
                `publish-adopt-symlink-${testCase.name}-cwd`,
            );
            const codexHomeDirectory = await createTemporaryDirectory(
                `publish-adopt-symlink-${testCase.name}-codex`,
            );
            const externalPath = await createTemporaryDirectory(
                `publish-adopt-symlink-${testCase.name}-external`,
            );
            const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
            const stdin = createInteractiveInput();
            const context = createPublishContext(settingsFilePath, { stdin });
            const skillId = `symlink-${testCase.name}-skill`;
            const sourceSkillDirectoryPath = join(cwd, skillId);
            const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
                settingsFilePath,
                skillId,
            );

            cleanup.track(configRootDirectoryPath);
            cleanup.track(cwd);
            cleanup.track(codexHomeDirectory);
            cleanup.track(externalPath);

            context.cwd = cwd;
            context.env = {
                CODEX_HOME: codexHomeDirectory,
                HOME: configRootDirectoryPath,
                USERPROFILE: configRootDirectoryPath,
            };

            await writeSkillFile(sourceSkillDirectoryPath, [
                "---",
                `name: ${skillId}`,
                "description: Use a path-local workflow.",
                "---",
                "",
            ].join("\n"));
            await mkdir(join(sourceSkillDirectoryPath, "nested"), { recursive: true });
            await createSymbolicLinkForTest(
                join(externalPath, "secret"),
                join(sourceSkillDirectoryPath, testCase.linkPath),
                testCase.linkKind,
            );

            stdin.feed("yes\n");

            await expect(publishSkillPackage(
                `./${skillId}`,
                context,
                "private",
                {},
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
                key: "errors.skills.publish.invalidSkillFile",
                params: {
                    message: `Skill entries must not be symbolic links: ${testCase.linkPath}.`,
                    path: sourceSkillDirectoryPath,
                },
            });

            expect(
                (await lstat(join(sourceSkillDirectoryPath, testCase.linkPath)))
                    .isSymbolicLink(),
            ).toBeTrue();
            await expect(stat(localSkillDirectoryPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
    });

    test("does not move an invalid path skill into local storage", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-invalid-path-config");
        const cwd = await createTemporaryDirectory("publish-invalid-path-cwd");
        const codexHomeDirectory = await createTemporaryDirectory("publish-invalid-path-codex");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const context = createPublishContext(settingsFilePath, { stdin });
        const sourceSkillDirectoryPath = join(cwd, "invalid-path-skill");
        const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "invalid-path-skill",
        );

        cleanup.track(configRootDirectoryPath);
        cleanup.track(cwd);
        cleanup.track(codexHomeDirectory);

        context.cwd = cwd;
        context.env = {
            CODEX_HOME: codexHomeDirectory,
            HOME: configRootDirectoryPath,
            USERPROFILE: configRootDirectoryPath,
        };

        await writeSkillFile(sourceSkillDirectoryPath, [
            "---",
            "name: other-skill",
            "description: Use a path-local workflow.",
            "---",
            "",
        ].join("\n"));

        stdin.feed("yes\n");

        await expect(publishSkillPackage(
            "./invalid-path-skill",
            context,
            "private",
            {},
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
            key: "errors.skills.publish.invalidSkillFile",
        });

        await expect(stat(sourceSkillDirectoryPath)).resolves.toMatchObject({
            isDirectory: expect.any(Function),
        });
        await expect(stat(localSkillDirectoryPath)).rejects.toMatchObject({
            code: "ENOENT",
        });
    });

    test("does not adopt an agent skill when another host target conflicts", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-agent-conflict-config");
        const codexHomeDirectory = await createTemporaryDirectory("publish-agent-conflict-codex");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const context = createPublishContext(settingsFilePath, { stdin });
        const claudeHomeDirectory = resolveClaudeHomeDirectory({
            HOME: configRootDirectoryPath,
            USERPROFILE: configRootDirectoryPath,
        });
        const sourceSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "conflict-skill",
        );
        const conflictingSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            "conflict-skill",
        );
        const localSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            settingsFilePath,
            "conflict-skill",
        );

        cleanup.track(configRootDirectoryPath);
        cleanup.track(codexHomeDirectory);

        context.env = {
            CODEX_HOME: codexHomeDirectory,
            HOME: configRootDirectoryPath,
            USERPROFILE: configRootDirectoryPath,
        };

        await mkdir(claudeHomeDirectory, { recursive: true });
        await writeSkillFile(sourceSkillDirectoryPath, [
            "---",
            "name: conflict-skill",
            "description: Use an agent-local workflow.",
            "---",
            "",
        ].join("\n"));
        await writeSkillFile(conflictingSkillDirectoryPath, [
            "---",
            "name: conflict-skill",
            "description: Existing unmanaged skill.",
            "---",
            "",
        ].join("\n"));

        stdin.feed("yes\n");

        await expect(publishSkillPackage(
            "conflict-skill",
            context,
            "private",
            { agentName: "codex" },
            {
                checkAuthoringEnvironment: () => Promise.resolve({
                    canonicalRootDirectoryPath: "",
                    hostCount: 2,
                }),
                convertSkillDirectoryToPackage: () => {
                    throw new Error("Conversion should not run.");
                },
                publishConvertedSkillPackage: () => Promise.resolve(),
            },
        )).rejects.toMatchObject({
            key: "errors.skills.nameConflict",
            params: {
                name: "conflict-skill",
                path: conflictingSkillDirectoryPath,
            },
        });

        await expect(stat(sourceSkillDirectoryPath)).resolves.toMatchObject({
            isDirectory: expect.any(Function),
        });
        await expect(stat(localSkillDirectoryPath)).rejects.toMatchObject({
            code: "ENOENT",
        });
    });

    test("rejects publishing bundled skills directly", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["skills", "publish", "oo"]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe(
                "Bundled skill oo cannot be published directly because it is managed by the oo CLI release. Create or adopt a local copy before publishing.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects publishing bundled skills by installed target path", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            "oo",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            const installResult = await sandbox.run(["skills", "install", "oo"]);
            expect(installResult.exitCode).toBe(0);

            const result = await sandbox.run(["skills", "publish", skillDirectoryPath]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe(
                "Bundled skill oo cannot be published directly because it is managed by the oo CLI release. Create or adopt a local copy before publishing.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects an unsupported publish agent", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "publish",
                "demo-skill",
                "--agent",
                "unknown",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toBe(
                "Unsupported skill agent: unknown. Use codex, claude, hermes, codebuddy, workbuddy, trae, trae-cn, openclaw, or qoderwork.\n",
            );
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

        const parsed = parseSkillMarkdownMatter(
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

        const parsed = parseSkillMarkdownMatter(
            await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toMatchObject({
            packageName: "@alice/blocked-skill",
            version: "1.2.4",
        });
    });

    test("publishes over a remote package with blocks when -y is passed", async () => {
        const { sandbox, skillDirectoryPath } = await createCliPublishSkillSandbox(
            "blocked-skill",
            [
                "---",
                "name: blocked-skill",
                "description: Use a known package workflow.",
                "---",
                "",
            ].join("\n"),
        );

        try {
            const result = await sandbox.run(
                ["skills", "publish", "blocked-skill", "-y"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/-/oomol/package-info/")) {
                            return new Response(JSON.stringify({
                                access: "restricted",
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
                            }));
                        }

                        return new Response("", { status: 201 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                "Published skill blocked-skill as private package @alice/blocked-skill@1.2.4. View it at https://hub.oomol.com/package/@alice/blocked-skill.\n",
            );

            const parsed = parseSkillMarkdownMatter(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                packageName: "@alice/blocked-skill",
                version: "1.2.4",
            });
        }
        finally {
            await sandbox.cleanup();
        }
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

        const parsed = parseSkillMarkdownMatter(
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

        const parsed = parseSkillMarkdownMatter(
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

        const parsed = parseSkillMarkdownMatter(
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
