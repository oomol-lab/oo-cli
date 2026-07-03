import type { CliCatalog, CliExecutionContext } from "../../contracts/cli.ts";

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import pino from "pino";
import {
    createAuthStore,
    createCacheStore,
    createCliSandbox,
    createInMemoryConnectorStore,
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
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { publishSkillPackage } from "./publish.ts";
import { parseSkillMarkdownMatter } from "./skill-frontmatter.ts";
import {
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
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

    test("publishes a local skill directory path through the CLI", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal"),
            "demo-skill",
        );

        try {
            await mkdir(resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal"), { recursive: true });
            await writeAuthFile(sandbox);
            await writeLocalSkillFile(skillDirectoryPath, createSkillMarkdown(
                "demo-skill",
                "Use a known package workflow.",
            ));

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "publish", skillDirectoryPath, "--visibility", "private"],
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
            expect(requests.map(request => `${request.method} ${request.url}`)).toEqual([
                "GET https://registry.oomol.com/-/oomol/package-info/%40alice%2Fdemo-skill/latest?lang=en",
                "PUT https://registry.oomol.com/@alice%2fdemo-skill",
            ]);

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

    test("publishes when the path points directly to SKILL.md", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-skill-file-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = join(configRootDirectoryPath, "file-skill");

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, createSkillMarkdown(
            "file-skill",
            "Use a path-local workflow.",
        ));

        const result = await publishSkillPackage(
            join(skillDirectoryPath, "SKILL.md"),
            context,
            "private",
            {},
            {
                publishConvertedSkillPackage: () => Promise.resolve(),
                resolveFinalPublishVersion: request => Promise.resolve(request.requestedVersion),
            },
        );

        expect(result).toMatchObject({
            packageName: "@alice/file-skill",
            skillDirectoryPath,
            skillId: "file-skill",
            version: "0.0.1",
        });
    });

    test("publishes a registry skill path and syncs canonical storage to agents", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "registry-skill",
        );
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "registry-skill",
        );
        const claudeSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            "registry-skill",
        );

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, [
                "---",
                "name: registry-skill",
                "description: Use a registry package workflow.",
                "metadata:",
                "  version: '0.2.0'",
                "---",
                "",
                "# Edited from agent",
                "",
            ].join("\n"));
            await writeRegistrySkillMetadata(
                skillDirectoryPath,
                "@alice/registry-skill",
                "0.1.0",
            );

            const result = await sandbox.run(
                ["skills", "publish", skillDirectoryPath, "--visibility", "private"],
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
                "Published skill registry-skill as private package @alice/registry-skill@0.2.0. View it at https://hub.oomol.com/package/@alice/registry-skill.\n",
            );
            expect(await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "# Edited from agent",
            );
            expect(await readFile(join(claudeSkillDirectoryPath, "SKILL.md"), "utf8")).toContain(
                "# Edited from agent",
            );
            expect(await readFile(resolveManagedSkillMetadataFilePath(canonicalSkillDirectoryPath), "utf8")).toBe(
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@alice/registry-skill",
                    version: "0.2.0",
                })),
            );
            expect(await readFile(resolveManagedSkillMetadataFilePath(claudeSkillDirectoryPath), "utf8")).toBe(
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@alice/registry-skill",
                    version: "0.2.0",
                })),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects a registry publish before PUT when another agent target is unmanaged", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "conflict-skill",
        );
        const claudeSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            "conflict-skill",
        );
        const requests: Request[] = [];

        try {
            await Promise.all([
                mkdir(universalHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await writeAuthFile(sandbox);
            await writeSkillFile(skillDirectoryPath, createSkillMarkdown(
                "conflict-skill",
                "Use a registry package workflow.",
            ));
            await writeRegistrySkillMetadata(
                skillDirectoryPath,
                "@alice/conflict-skill",
                "0.1.0",
            );
            await writeSkillFile(claudeSkillDirectoryPath, createSkillMarkdown(
                "conflict-skill",
                "Use an unmanaged conflicting workflow.",
            ));

            const result = await sandbox.run(
                ["skills", "publish", skillDirectoryPath, "--visibility", "private"],
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

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain(
                `Skill name conflict-skill is already used by a non-OOMOL skill at ${claudeSkillDirectoryPath}.`,
            );
            expect(requests.map(request => request.method)).toEqual(["GET"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects bare skill ids because publish is path-first", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-id-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);

        cleanup.track(configRootDirectoryPath);

        await expect(publishSkillPackage(
            "missing-skill",
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
            key: "errors.skills.publish.skillNotFound",
        });
    });

    test("rejects invalid oo ownership metadata", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-invalid-metadata-config");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = join(configRootDirectoryPath, "invalid-metadata-skill");

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, createSkillMarkdown(
            "invalid-metadata-skill",
            "Use an invalid metadata workflow.",
        ));
        await Bun.write(
            resolveManagedSkillMetadataFilePath(skillDirectoryPath),
            "{",
        );

        await expect(publishSkillPackage(
            skillDirectoryPath,
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
            key: "errors.skills.publish.invalidOwnershipMetadata",
        });
    });

    test("rejects publishing under the OO_API_KEY override when no scoped package name is available", async () => {
        const configRootDirectoryPath = await createTemporaryDirectory("publish-env-api-key");
        const settingsFilePath = join(configRootDirectoryPath, "settings.toml");
        const context = createPublishContext(settingsFilePath);
        const skillDirectoryPath = join(configRootDirectoryPath, "env-api-key-skill");

        cleanup.track(configRootDirectoryPath);

        await writeSkillFile(skillDirectoryPath, createSkillMarkdown(
            "env-api-key-skill",
            "Use an env api key workflow.",
        ));

        await expect(publishSkillPackage(
            skillDirectoryPath,
            context,
            "private",
            {},
            {
                // Simulate auth resolved from OO_API_KEY: a synthetic account
                // with no real scope (id "oo-env-override").
                requireCurrentAccount: async () => ({
                    apiKey: "env-key",
                    endpoint: "oomol.com",
                    id: "oo-env-override",
                    name: "Environment (OO_API_KEY)",
                }),
                convertSkillDirectoryToPackage: () => {
                    throw new Error("Conversion should not run.");
                },
                publishConvertedSkillPackage: () => Promise.resolve(),
            },
        )).rejects.toMatchObject({
            key: "errors.skills.publish.envApiKeyPackageName",
        });
    });
});

function createPublishContext(
    settingsFilePath: string,
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
        connectorStore: createInMemoryConnectorStore(),
        currentLogFilePath: "",
        execPath: process.execPath,
        fetcher: () => Promise.reject(new Error("Unexpected fetch.")),
        cwd: process.cwd(),
        env: {
            HOME: configRootDirectoryPath,
            USERPROFILE: configRootDirectoryPath,
        },
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        stdin: createInteractiveInput(),
        logger: pino({
            enabled: false,
        }),
        packageName: "@oomol-lab/oo-cli",
        settingsStore,
        stdout: stdout.writer,
        stderr: stderr.writer,
        translator: createTranslator("en"),
        completionRenderer: {
            render: () => "",
        },
        catalog: emptyCatalog,
        version: "0.1.0",
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
        renderSkillMetadataJson(createRegistrySkillMetadata({ packageName, version })),
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
