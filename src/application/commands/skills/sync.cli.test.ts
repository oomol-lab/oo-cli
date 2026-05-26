import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

const TEST_CLI_VERSION = "9.9.9";

describe("skills sync upload --json", () => {
    test("returns records[] with uploaded count", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "sync", "upload", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("[]"),
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.sync.upload");
            expect(payload.status).toBe("completed");
            expect((payload.summary as Record<string, number>).recordsUploaded).toBe(1);
            const records = payload.records as Array<Record<string, unknown>>;

            expect(records).toHaveLength(1);
            expect(records[0]).toMatchObject({
                skillId: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });
            // Never leak apiKey in JSON
            expect(result.stdout).not.toContain("api-key");
            expect(result.stdout).not.toContain("apiKey");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("upload request failure still emits JSON with errors", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "sync", "upload", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("oops", { status: 500 }),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({ code: "sync_upload_failed" });
            const records = payload.records as Array<Record<string, unknown>>;

            expect(records).toHaveLength(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--ignore filter excludes matching records", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "sync", "upload", "--ignore", "@alice/*", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("[]"),
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect((payload.summary as Record<string, number>).recordsIgnored).toBe(1);
            expect((payload.summary as Record<string, number>).recordsUploaded).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("not authenticated returns command-level error", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "sync", "upload", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors[0]).toMatchObject({ code: "not_authenticated" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "sync", "upload", "--format", "xml"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "sync", "upload", "--json", "--show-schema-version"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("[]"),
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload.command).toBe("skills.sync.upload");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("no supported hosts returns command-level error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "sync", "upload", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("[]"),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({ code: "no_supported_hosts" });
            expect(payload.records).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("unexpected filesystem throw is normalized to unknown error JSON", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");

            await mkdir(homeDirectory, { recursive: true });
            // Make <home>/skills be a regular file rather than a directory.
            // readSkillsDirectoryEntries on it will throw ENOTDIR (not ENOENT),
            // which is *not* covered by any inner try/catch in the upload path.
            // The outer safety net must convert it to a stable JSON payload.
            const skillsPath = join(homeDirectory, "skills");

            await writeFile(skillsPath, "not a directory\n");

            const result = await sandbox.run(
                ["skills", "sync", "upload", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("[]"),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.sync.upload");
            expect(payload.status).toBe("failed");
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({ code: "unknown" });
            // Raw error text must not leak into JSON.
            expect(result.stdout).not.toContain("ENOTDIR");
            expect(result.stdout).not.toContain("not a directory");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("skills sync apply --json", () => {
    test("no records returns noop", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "sync", "apply", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const req = toRequest(input, init);

                        if (req.method === "GET" && req.url.includes("/v1/skills")) {
                            return new Response("[]");
                        }
                        throw new Error(`Unexpected request: ${req.method} ${req.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.sync.apply");
            expect(payload.status).toBe("noop");
            expect(payload.skills).toEqual([]);
            expect(payload.errors).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("download request failure emits sync_download_failed error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "sync", "apply", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("err", { status: 500 }),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors[0]).toMatchObject({ code: "sync_download_failed" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("invalid response yields sync_invalid_response", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "sync", "apply", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("{not json"),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors[0]).toMatchObject({ code: "sync_invalid_response" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("no supported hosts returns command-level error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "sync", "apply", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors[0]).toMatchObject({ code: "no_supported_hosts" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("single record install failure surfaces as skills[].failed not errors[]", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "codex");

            await mkdir(homeDirectory, { recursive: true });

            let downloadCalls = 0;
            const result = await sandbox.run(
                ["skills", "sync", "apply", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const req = toRequest(input, init);

                        if (req.method === "GET" && req.url.includes("/v1/skills") && !req.url.includes("package-info")) {
                            downloadCalls += 1;
                            return new Response(JSON.stringify([
                                {
                                    packageName: "@alice/demo",
                                    skillName: "demo",
                                    version: "0.2.0",
                                },
                            ]));
                        }
                        if (req.url.includes("/package-info/")) {
                            return new Response("server error", { status: 500 });
                        }
                        throw new Error(`Unexpected request: ${req.method} ${req.url}`);
                    },
                },
            );

            expect(downloadCalls).toBe(1);
            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            // Per-record failure should be in skills[], not top-level errors[]
            expect(payload.errors).toEqual([]);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(1);
            expect(skills[0]).toMatchObject({
                skillId: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
                status: "failed",
            });
            expect((skills[0]!.error as Record<string, unknown>).code).toBe("package_lookup_failed");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function seedRegistrySkill(options: {
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>;
    skillName: string;
    packageName: string;
    version: string;
}): Promise<void> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(options.sandbox.env, "codex");
    const hostDirectory = resolveManagedSkillDirectoryPath(homeDirectory, options.skillName);
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: options.sandbox.env,
        platform: process.platform,
    });
    const canonicalDirectory = resolveManagedSkillCanonicalDirectoryPath(
        storePaths.settingsFilePath,
        options.skillName,
    );

    await mkdir(homeDirectory, { recursive: true });
    await mkdir(canonicalDirectory, { recursive: true });
    await mkdir(hostDirectory, { recursive: true });
    await writeFile(join(canonicalDirectory, "SKILL.md"), "# r\n");
    await writeFile(join(hostDirectory, "SKILL.md"), "# r\n");
    const metadata = renderSkillMetadataJson(createRegistrySkillMetadata({
        packageName: options.packageName,
        version: options.version,
    }));

    await writeFile(resolveManagedSkillMetadataFilePath(canonicalDirectory), metadata);
    await writeFile(resolveManagedSkillMetadataFilePath(hostDirectory), metadata);
}
