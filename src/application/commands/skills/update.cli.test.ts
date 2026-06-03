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

function packageInfoResponse(packageName: string, version: string, skillName: string) {
    return new Response(JSON.stringify({
        packageName,
        version,
        skills: [{ description: "demo", name: skillName, title: skillName }],
    }));
}

async function seedRegistrySkill(options: {
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>;
    skillName: string;
    packageName: string;
    version: string;
}): Promise<void> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(options.sandbox.env, "universal");
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

describe("skills update --json", () => {
    test("no installed registry skills returns noop", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "update", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.update");
            expect(payload.status).toBe("noop");
            expect(payload.skills).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("up-to-date returns current status", async () => {
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
                ["skills", "update", "@alice/demo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const req = toRequest(input, init);

                        if (req.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${req.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("completed");
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "demo",
                packageName: "@alice/demo",
                previousVersion: "0.2.0",
                version: "0.2.0",
                status: "current",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("a package updates all of its installed skills together", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "one",
                packageName: "@alice/multi",
                version: "0.2.0",
            });
            await seedRegistrySkill({
                sandbox,
                skillName: "two",
                packageName: "@alice/multi",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "update", "@alice/multi", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const req = toRequest(input, init);

                        if (req.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "@alice/multi",
                                version: "0.2.0",
                                skills: [
                                    { description: "demo", name: "one", title: "one" },
                                    { description: "demo", name: "two", title: "two" },
                                ],
                            }));
                        }
                        throw new Error(`Unexpected request: ${req.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // Both skills of the requested package are resolved and reported.
            expect(skills.map(skill => skill.skillId).sort()).toEqual(["one", "two"]);
            expect(skills.every(skill => skill.status === "current")).toBe(true);
            expect(skills.every(skill => skill.packageName === "@alice/multi")).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("processes multiple package args in input order, de-duplicating and interleaving a bundled failure", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "bar",
                packageName: "@alice/bar",
                version: "1.0.0",
            });
            await seedRegistrySkill({
                sandbox,
                skillName: "foo",
                packageName: "@alice/foo",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "update", "@alice/bar", "@alice/foo", "@alice/bar", "oo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const req = toRequest(input, init);

                        if (req.url.includes("package-info/%40alice%2Fbar")
                            || req.url.includes("package-info/@alice/bar")) {
                            return packageInfoResponse("@alice/bar", "1.0.0", "bar");
                        }
                        if (req.url.includes("package-info/%40alice%2Ffoo")
                            || req.url.includes("package-info/@alice/foo")) {
                            return packageInfoResponse("@alice/foo", "0.2.0", "foo");
                        }
                        throw new Error(`Unexpected request: ${req.url}`);
                    },
                },
            );

            // The bundled "oo" produces a failed entry, so the command exits 1.
            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // Input order preserved, the duplicate @alice/bar collapsed, bundled
            // "oo" interleaved as a failed entry in its requested position.
            expect(skills.map(skill => skill.skillId)).toEqual(["bar", "foo", "oo"]);
            expect(skills[0]).toMatchObject({ skillId: "bar", status: "current" });
            expect(skills[1]).toMatchObject({ skillId: "foo", status: "current" });
            expect(skills[2]).toMatchObject({
                kind: "bundled",
                status: "failed",
                error: { code: "bundled_unsupported" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("unknown package returns failed with package_not_installed code", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "update", "@ghost/missing", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "@ghost/missing",
                packageName: "@ghost/missing",
                status: "failed",
                error: { code: "package_not_installed" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("bundled name returns bundled_unsupported", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "update", "oo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                kind: "bundled",
                status: "failed",
                error: { code: "bundled_unsupported" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("package lookup failure surfaces per-skill failed", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.1.0",
            });

            const result = await sandbox.run(
                ["skills", "update", "@alice/demo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("err", { status: 500 }),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "demo",
                packageName: "@alice/demo",
                previousVersion: "0.1.0",
                status: "failed",
                error: { code: "package_lookup_failed" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("universal host is always available so empty update returns noop", async () => {
        const sandbox = await createCliSandbox();

        try {
            // No agent home directory is created on disk. The universal host is
            // always provisioned, so there is at least one available host and the
            // command no longer fails with a no-supported-hosts error.
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "update", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.update");
            expect(payload.status).toBe("noop");
            expect(payload.skills).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("invalid tarball maps to invalid_package_archive (P0 regression)", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.1.0",
            });

            const result = await sandbox.run(
                ["skills", "update", "@alice/demo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const req = toRequest(input, init);

                        if (req.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        // Return non-tgz bytes as the tarball.
                        return new Response(new Uint8Array([0, 1, 2, 3, 4, 5]));
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.update");
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "demo",
                status: "failed",
                error: { code: "invalid_package_archive" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("error.message uses fixed template and does not leak raw error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.1.0",
            });

            const result = await sandbox.run(
                ["skills", "update", "@alice/demo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => {
                        throw new Error("secret-token: do-not-leak");
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).not.toContain("secret-token");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "update", "--format", "xml"],
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
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "update", "--json", "--show-schema-version"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload.command).toBe("skills.update");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
