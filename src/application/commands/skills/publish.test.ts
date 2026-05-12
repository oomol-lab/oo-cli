import type { CliCatalog, CliExecutionContext, Fetcher } from "../../contracts/cli.ts";

import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import {
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
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

    test("publishes an agent-native local skill through the CLI", async () => {
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
                    command_full: "skills.publish",
                    force: false,
                    source_kind: "local",
                    visibility: "private",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("package_name");
            expect(telemetryPayload?.properties).not.toHaveProperty("skill_id");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("preserves a local skill package scope from frontmatter", async () => {
        const { sandbox, skillDirectoryPath } = await createCliPublishSkillSandbox(
            "scoped-skill",
            [
                "---",
                "name: scoped-skill",
                "description: Use a package with an existing scope.",
                "metadata:",
                "  packageName: '@bob/scoped-skill'",
                "---",
                "",
            ].join("\n"),
        );

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "publish", "scoped-skill", "--visibility", "private"],
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
                "Published skill scoped-skill as private package @bob/scoped-skill@0.0.1. View it at https://hub.oomol.com/package/@bob/scoped-skill.\n",
            );
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40bob%2Fscoped-skill/latest?lang=en",
                "PUT https://registry.oomol.com/@bob%2fscoped-skill",
            ]);

            const parsed = parseSkillMarkdownMatter(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                packageName: "@bob/scoped-skill",
                version: "0.0.1",
            });

            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    force: false,
                    source_kind: "local",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("package_name");
            expect(telemetryPayload?.properties).not.toHaveProperty("skill_id");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires an agent when local skill ids are ambiguous across agents", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-ambiguous-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillId = "ambiguous-skill";
        const codexSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveCodexHomeDirectory(context.env),
            skillId,
        );
        const claudeSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            join(configRootDirectoryPath, ".claude"),
            skillId,
        );

        cleanup.track(configRootDirectoryPath);

        await Promise.all([
            writeLocalSkillFile(codexSkillDirectoryPath, createSkillMarkdown(
                skillId,
                "Use the Codex workflow.",
            )),
            writeLocalSkillFile(claudeSkillDirectoryPath, createSkillMarkdown(
                skillId,
                "Use the Claude workflow.",
            )),
        ]);

        await expect(publishSkillPackage(
            skillId,
            context,
            "private",
            {},
            {
                convertSkillDirectoryToPackage: () => {
                    throw new Error("Conversion should not run.");
                },
                publishConvertedSkillPackage: () => Promise.resolve(),
            },
        )).rejects.toMatchObject({
            key: "errors.skills.publish.localSkillAmbiguous",
        });
    });

    test("publishes the selected agent-native local skill when an agent is provided", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-selected-agent-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillId = "selected-local-skill";
        const codexSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveCodexHomeDirectory(context.env),
            skillId,
        );
        const claudeSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            join(configRootDirectoryPath, ".claude"),
            skillId,
        );

        cleanup.track(configRootDirectoryPath);

        await Promise.all([
            writeLocalSkillFile(codexSkillDirectoryPath, createSkillMarkdown(
                skillId,
                "Use the Codex workflow.",
            )),
            writeLocalSkillFile(claudeSkillDirectoryPath, createSkillMarkdown(
                skillId,
                "Use the Claude workflow.",
            )),
        ]);

        const result = await publishSkillPackage(
            skillId,
            context,
            "private",
            { agentName: "codex" },
            {
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result).toMatchObject({
            packageName: "@alice/selected-local-skill",
            skillDirectoryPath: codexSkillDirectoryPath,
            skillId,
            version: "0.0.1",
        });
        expect(await readFile(join(claudeSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
            "Use the Claude workflow.",
        );
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
            await writeRegistrySkillMetadata(
                skillDirectoryPath,
                "@alice/registry-skill",
                "0.1.0",
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

    test("publishes a registry skill using its installed package name", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-registry-package-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            settingsFilePath,
            "registry-owned-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: registry-owned-skill",
            "description: Use a registry package workflow.",
            "---",
            "",
        ].join("\n"));
        await writeRegistrySkillMetadata(
            skillDirectoryPath,
            "@bob/registry-owned-skill",
            "0.1.0",
        );

        const result = await publishSkillPackage(
            "registry-owned-skill",
            context,
            "private",
            {},
            {
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result.packageName).toBe("@bob/registry-owned-skill");
    });

    test("falls back when registry skill metadata has an invalid scoped package name", async () => {
        const invalidPackageNames = [
            "@bob/registry-owned-skill/extra",
            "@/registry-owned-skill",
            "@bob/",
        ];

        for (const invalidPackageName of invalidPackageNames) {
            const configRootDirectoryPath = await createTemporaryDirectory("publish-invalid-registry-package-config");
            const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
            const context = createPublishContext(settingsFilePath);
            const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
                settingsFilePath,
                "registry-owned-skill",
            );

            cleanup.track(configRootDirectoryPath);

            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: registry-owned-skill",
                "description: Use a registry package workflow.",
                "---",
                "",
            ].join("\n"));
            await writeRegistrySkillMetadata(
                skillDirectoryPath,
                invalidPackageName,
                "0.1.0",
            );

            const result = await publishSkillPackage(
                "registry-owned-skill",
                context,
                "private",
                { yes: true },
                {
                    publishConvertedSkillPackage: () => Promise.resolve(),
                    resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
                },
            );

            expect(result.packageName).toBe("@alice/registry-owned-skill");
        }
    });

    test("ignores registry skill share ids when preserving scoped package names", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-registry-share-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            settingsFilePath,
            "shared-registry-skill",
        );

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, [
            "---",
            "name: shared-registry-skill",
            "description: Use a registry package workflow.",
            "---",
            "",
        ].join("\n"));
        await writeRegistrySkillMetadata(
            skillDirectoryPath,
            "@bob/shared-registry-skill#share-1",
            "0.1.0",
        );

        const result = await publishSkillPackage(
            "shared-registry-skill",
            context,
            "private",
            {},
            {
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result.packageName).toBe("@bob/shared-registry-skill");
    });

    test("publishes a registry skill using its installed package name when --yes is passed", async () => {
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
            await writeRegistrySkillMetadata(
                skillDirectoryPath,
                "@bob/forked-skill",
                "0.1.0",
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
                "Published skill forked-skill as private package @bob/forked-skill@0.0.1. View it at https://hub.oomol.com/package/@bob/forked-skill.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("publishes an agent-native local skill in place", async () => {
        const { sandbox, skillDirectoryPath } = await createCliPublishSkillSandbox(
            "agent-skill",
            [
                "---",
                "name: agent-skill",
                "description: Use an agent-local workflow.",
                "metadata:",
                "  icon: ':sparkles:'",
                "  packageName: '@bob/agent-skill'",
                "  version: '0.3.0'",
                "---",
                "",
            ].join("\n"),
        );

        try {
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
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Published skill agent-skill as private package @bob/agent-skill@0.3.0. View it at https://hub.oomol.com/package/@bob/agent-skill.\n",
            );
            expect(await readFile(resolveManagedSkillMetadataFilePath(skillDirectoryPath), "utf8")).toBe(
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const parsed = parseSkillMarkdownMatter(
                await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8"),
            );

            expect(parsed.data.metadata).toMatchObject({
                icon: ":sparkles:",
                packageName: "@bob/agent-skill",
                version: "0.3.0",
            });
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "skills.publish",
                    force: false,
                    source_kind: "local",
                    visibility: "private",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("package_name");
            expect(telemetryPayload?.properties).not.toHaveProperty("skill_id");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("publishes a skill from a relative path in place", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-path-config");
        const cwd = await createTemporaryDirectory("publish-path-cwd");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const context = createPublishContext(settingsFilePath, { stdin });
        const sourceSkillDirectoryPath = join(cwd, "path-skill");

        cleanup.track(configRootDirectoryPath);
        cleanup.track(cwd);

        context.cwd = cwd;

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
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result).toMatchObject({
            packageName: "@alice/path-skill",
            skillDirectoryPath: sourceSkillDirectoryPath,
            skillId: "path-skill",
            version: "0.0.1",
        });
        await expect(stat(sourceSkillDirectoryPath)).resolves.toMatchObject({
            isDirectory: expect.any(Function),
        });
    });

    test("does not modify an invalid path skill", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-invalid-path-config");
        const cwd = await createTemporaryDirectory("publish-invalid-path-cwd");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const stdin = createInteractiveInput();
        const context = createPublishContext(settingsFilePath, { stdin });
        const sourceSkillDirectoryPath = join(cwd, "invalid-path-skill");

        cleanup.track(configRootDirectoryPath);
        cleanup.track(cwd);

        context.cwd = cwd;

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
                "Bundled skill oo cannot be published directly because it is managed by the oo CLI release. Create a local skill before publishing.\n",
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
                "Bundled skill oo cannot be published directly because it is managed by the oo CLI release. Create a local skill before publishing.\n",
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
        const skillDirectoryPath = resolveCodexSkillDirectoryPath(context.env, "versioned-skill");

        cleanup.track(configRootDirectoryPath);

        await writeLocalSkillFile(skillDirectoryPath, [
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
        const skillDirectoryPath = resolveCodexSkillDirectoryPath(context.env, "blocked-skill");
        let publishCalled = false;

        cleanup.track(configRootDirectoryPath);

        await writeLocalSkillFile(skillDirectoryPath, [
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
        const skillDirectoryPath = resolveCodexSkillDirectoryPath(context.env, "blocked-skill");

        cleanup.track(configRootDirectoryPath);

        await writeLocalSkillFile(skillDirectoryPath, [
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
        const skillDirectoryPath = resolveCodexSkillDirectoryPath(context.env, "blocked-skill");

        cleanup.track(configRootDirectoryPath);

        await writeLocalSkillFile(skillDirectoryPath, [
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
        const skillDirectoryPath = resolveCodexSkillDirectoryPath(context.env, "versioned-skill");

        cleanup.track(configRootDirectoryPath);

        await writeLocalSkillFile(skillDirectoryPath, [
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

    test("preserves local metadata when publishing fails", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-fail-config");
        const temporaryPackageRoot = await createTemporaryDirectory("publish-fail-package");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = resolveCodexSkillDirectoryPath(context.env, "failing-skill");

        cleanup.track(configRootDirectoryPath);

        await writeLocalSkillFile(skillDirectoryPath, [
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
        expect(await readFile(resolveManagedSkillMetadataFilePath(skillDirectoryPath), "utf8")).toBe(
            renderSkillMetadataJson(createLocalSkillMetadata()),
        );
    });

    test("rejects a missing local skill", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-missing-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);

        cleanup.track(configRootDirectoryPath);

        await expect(publishLocalSkillPackage(
            "missing-skill",
            context,
            "private",
            {
            },
        )).rejects.toMatchObject({
            key: "errors.skills.publish.skillNotFound",
        });
    });
});

function resolveCodexSkillDirectoryPath(
    env: Record<string, string | undefined>,
    skillId: string,
): string {
    return resolveManagedSkillDirectoryPath(
        resolveCodexHomeDirectory(env),
        skillId,
    );
}

async function createCliPublishSkillSandbox(
    skillId: string,
    skillMarkdown: string,
    options: {
        auth?: Parameters<typeof writeAuthFile>[1];
    } = {},
) {
    const sandbox = await createCliSandbox();
    const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
    const skillDirectoryPath = resolveCodexSkillDirectoryPath(sandbox.env, skillId);

    await mkdir(codexHomeDirectory, { recursive: true });
    await writeAuthFile(sandbox, options.auth);
    await writeLocalSkillFile(skillDirectoryPath, skillMarkdown);

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
    const configRootDirectoryPath = dirname(settingsFilePath);
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
        env: {
            CODEX_HOME: join(configRootDirectoryPath, ".codex"),
            HOME: configRootDirectoryPath,
            USERPROFILE: configRootDirectoryPath,
        },
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

async function writeLocalSkillFile(
    directoryPath: string,
    content: string,
): Promise<void> {
    await writeSkillFile(directoryPath, content);
    await Bun.write(
        resolveManagedSkillMetadataFilePath(directoryPath),
        renderSkillMetadataJson(createLocalSkillMetadata()),
    );
}

async function writeRegistrySkillMetadata(
    directoryPath: string,
    packageName: string,
    version: string,
): Promise<void> {
    await Bun.write(
        resolveManagedSkillMetadataFilePath(directoryPath),
        renderSkillMetadataJson({
            kind: "registry",
            packageName,
            schemaVersion: 1,
            version,
        }),
    );
}

function createSkillMarkdown(
    skillId: string,
    description: string,
): string {
    return [
        "---",
        `name: ${skillId}`,
        `description: ${description}`,
        "---",
        "",
    ].join("\n");
}
