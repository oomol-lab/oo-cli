import { mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import {
    packageInfoResponse,
    seedBundledHostSkill,
    seedRegistrySkill,
} from "./__tests__/helpers.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skills check-update CLI", () => {
    test("--json reports update-available when remote latest is newer", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.1.0",
            });

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "check-update", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);
                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toMatchObject({
                summary: {
                    registrySkills: 1,
                    registrySkillUpdates: 1,
                    registrySkillRepairs: 0,
                    registrySkillsCurrent: 0,
                    registrySkillFailures: 0,
                },
            });
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(1);
            expect(skills[0]).toEqual({
                skillId: "demo",
                packageName: "@alice/demo",
                currentVersion: "0.1.0",
                latestVersion: "0.2.0",
                status: "update-available",
            });
            // Read-only contract: no tarball download
            expect(requests.every(r => !r.url.includes(".tgz"))).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports up-to-date when version matches and host content matches", async () => {
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
                ["skills", "check-update", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]?.status).toBe("up-to-date");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports repair-required when host is a legacy symlink to canonical", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const { hostDirectory, canonicalDirectory } = await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });
            // Replace the real host directory with a legacy symlink to the
            // canonical copy. `isManagedSkillPublicationCurrent()` returns
            // false for symlinks, so `oo skills update` would rewrite it
            // even though version + content match. Auto-sync on startup sees
            // matching metadata and skips, preserving the symlink for the
            // test to observe.
            await rm(hostDirectory, { recursive: true, force: true });
            // Windows CI does not grant directory symlink privileges; use a
            // junction there. Junctions still report as symbolic links via
            // lstat(), which is the branch isManagedSkillPublicationCurrent()
            // checks.
            await symlink(
                canonicalDirectory,
                hostDirectory,
                process.platform === "win32" ? "junction" : "dir",
            );
            await expect(stat(hostDirectory)).resolves.toMatchObject({});

            const result = await sandbox.run(
                ["skills", "check-update", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]?.status).toBe("repair-required");
            expect(payload.summary).toMatchObject({
                registrySkillUpdates: 0,
                registrySkillRepairs: 1,
                registrySkillsCurrent: 0,
                registrySkillFailures: 0,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports package_not_installed and ignores same-name unmanaged directories", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const skillDirectory = resolveManagedSkillDirectoryPath(homeDirectory, "ghost");

            // A same-name host directory without .oo-metadata.json is not a
            // managed registry skill, so no package resolves to it.
            await mkdir(skillDirectory, { recursive: true });
            await writeFile(join(skillDirectory, "SKILL.md"), "# user content\n");

            const result = await sandbox.run(
                ["skills", "check-update", "@nobody/ghost", "--json"],
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "@nobody/ghost",
                packageName: "@nobody/ghost",
                status: "failed",
            });
            expect((skills[0]?.error as Record<string, unknown>)?.code).toBe("package_not_installed");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json multiple package args return entries in input order with de-duplication", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "foo",
                packageName: "@alice/foo",
                version: "0.1.0",
            });
            await seedRegistrySkill({
                sandbox,
                skillName: "bar",
                packageName: "@alice/bar",
                version: "1.0.0",
            });

            const result = await sandbox.run(
                [
                    "skills",
                    "check-update",
                    "@alice/bar",
                    "@alice/foo",
                    "@alice/bar",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("package-info/%40alice%2Ffoo")
                            || request.url.includes("package-info/@alice/foo")) {
                            return packageInfoResponse("@alice/foo", "0.2.0", "foo");
                        }
                        if (request.url.includes("package-info/%40alice%2Fbar")
                            || request.url.includes("package-info/@alice/bar")) {
                            return packageInfoResponse("@alice/bar", "1.0.0", "bar");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills.map(entry => entry.skillId)).toEqual(["bar", "foo"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("a package checks all of its installed skills together", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "one",
                packageName: "@alice/multi",
                version: "0.1.0",
            });
            await seedRegistrySkill({
                sandbox,
                skillName: "two",
                packageName: "@alice/multi",
                version: "0.1.0",
            });

            const result = await sandbox.run(
                ["skills", "check-update", "@alice/multi", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return new Response(JSON.stringify({
                                packageName: "@alice/multi",
                                version: "0.2.0",
                                skills: [
                                    { description: "demo", name: "one", title: "one" },
                                    { description: "demo", name: "two", title: "two" },
                                ],
                            }));
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // Both installed skills of the requested package are checked.
            expect(skills.map(skill => skill.skillId).sort()).toEqual(["one", "two"]);
            expect(skills.every(skill => skill.status === "update-available")).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports failed bundled_unsupported for bundled skill", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "check-update", "oo", "--json"],
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect((skills[0]?.error as Record<string, unknown>)?.code).toBe("bundled_unsupported");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports package_not_installed for a local-only skill name", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const skillDirectory = resolveManagedSkillDirectoryPath(homeDirectory, "local-skill");

            await mkdir(skillDirectory, { recursive: true });
            await writeFile(
                join(skillDirectory, "SKILL.md"),
                "---\nname: local-skill\ndescription: A local skill.\n---\n",
            );
            await writeFile(
                resolveManagedSkillMetadataFilePath(skillDirectory),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            // Local skills are not registry-managed, so no package matches them.
            const result = await sandbox.run(
                ["skills", "check-update", "local-skill", "--json"],
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect((skills[0]?.error as Record<string, unknown>)?.code).toBe("package_not_installed");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports package_lookup_failed when package-info request errors", async () => {
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
                ["skills", "check-update", "--json"],
                {
                    fetcher: async () => {
                        throw new Error("network blip");
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect((skills[0]?.error as Record<string, unknown>)?.code).toBe("package_lookup_failed");
            expect(payload.summary).toMatchObject({ registrySkillFailures: 1 });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
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
                ["skills", "check-update", "--json", "--show-schema-version"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload).toHaveProperty("summary");
            expect(payload).toHaveProperty("skills");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2 with format error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(["skills", "check-update", "--format", "xml"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("no package args: checks all installed registry skills and excludes bundled", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });
            // Seed a bundled skill — should be ignored by check-update default scan
            const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const ooSkillDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");
            await mkdir(ooSkillDirectory, { recursive: true });
            await writeFile(join(ooSkillDirectory, "SKILL.md"), "# oo\n");
            await writeFile(
                resolveManagedSkillMetadataFilePath(ooSkillDirectory),
                renderSkillMetadataJson(createBundledSkillMetadata("9.9.9")),
            );

            const result = await sandbox.run(
                ["skills", "check-update", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // Only the registry skill is checked; bundled `oo` is skipped.
            expect(skills.map(entry => entry.skillId)).toEqual(["demo"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--skill narrows the checked skills case-insensitively and ignores unknown names", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "foo",
                packageName: "@alice/foo",
                version: "0.1.0",
            });
            await seedRegistrySkill({
                sandbox,
                skillName: "bar",
                packageName: "@alice/bar",
                version: "1.0.0",
            });

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "check-update", "--skill", "FOO", "missing", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);
                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/foo", "0.2.0", "foo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // Only "foo" is checked: the mixed-case token matches it and the
            // unknown "missing" token is silently ignored; "bar" is excluded.
            expect(skills.map(entry => entry.skillId)).toEqual(["foo"]);
            expect(skills[0]?.status).toBe("update-available");
            expect(requests.every(request => request.url.includes("foo"))).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--skill with no matching installed skill exits 1 and lists available skills", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "foo",
                packageName: "@alice/foo",
                version: "0.1.0",
            });

            // The filter excludes every resolved skill before any network call,
            // so no fetcher is needed.
            const result = await sandbox.run(
                ["skills", "check-update", "--skill", "nope"],
            );

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("foo");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--skill alongside package args narrows registry entries but keeps a bundled failed entry", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "foo",
                packageName: "@alice/foo",
                version: "0.1.0",
            });

            // Package names BEFORE --skill so the variadic option does not consume
            // them. `oo` is bundled and becomes a failed entry that survives the
            // skill filter; the registry entry `foo` is narrowed and checked.
            const result = await sandbox.run(
                ["skills", "check-update", "@alice/foo", "oo", "--skill", "foo", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/foo", "0.2.0", "foo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            const fooEntry = skills.find(entry => entry.skillId === "foo");
            const ooEntry = skills.find(entry => entry.skillId === "oo");

            expect(fooEntry?.status).toBe("update-available");
            expect((ooEntry?.error as Record<string, unknown>)?.code).toBe("bundled_unsupported");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports the highest installed version when canonical and host copies diverge", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const { canonicalDirectory } = await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.1.0",
            });

            // A partially applied update leaves the canonical copy ahead of the
            // host copy; the installed version is the highest copy anywhere.
            await writeFile(
                resolveManagedSkillMetadataFilePath(canonicalDirectory),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@alice/demo",
                    version: "0.3.0",
                })),
            );

            const result = await sandbox.run(
                ["skills", "check-update", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.3.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // The stale host copy still needs repair, but the reported
            // installed version is the newest copy, matching `skills sync`.
            expect(skills).toHaveLength(1);
            expect(skills[0]).toEqual({
                skillId: "demo",
                packageName: "@alice/demo",
                currentVersion: "0.3.0",
                latestVersion: "0.3.0",
                status: "repair-required",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("a same-name bundled host copy does not hide a registry skill from another host", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            // Registry copy lives on the claude host; the universal host holds
            // an unrelated bundled-metadata directory under the same name.
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
                agent: "claude",
            });
            await seedBundledHostSkill({
                sandbox,
                skillName: "demo",
                version: "9.9.9",
            });

            const result = await sandbox.run(
                ["skills", "check-update", "@alice/demo", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.2.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // The bundled copy is a different skill identity, so the package
            // resolves; the universal host still needs the registry publish.
            expect(skills).toHaveLength(1);
            expect(skills[0]).toEqual({
                skillId: "demo",
                packageName: "@alice/demo",
                currentVersion: "0.2.0",
                latestVersion: "0.2.0",
                status: "repair-required",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
