import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
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

describe("skills install --json", () => {
    test("bundled install returns installed skills with targets", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.install");
            expect(payload.status).toBe("completed");
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills.length).toBeGreaterThanOrEqual(1);
            const ooSkill = skills.find(s => s.skillId === "oo");

            expect(ooSkill).toBeDefined();
            expect(ooSkill).toMatchObject({
                kind: "bundled",
                status: "installed",
                version: TEST_CLI_VERSION,
            });
            const targets = ooSkill!.targets as Array<Record<string, unknown>>;

            expect(targets.length).toBeGreaterThanOrEqual(1);
            const universalTarget = targets.find(target => target.agentId === "universal");
            expect(universalTarget).toMatchObject({
                agentId: "universal",
                status: "installed",
            });
            // Note: auto-sync runs on CLI startup, so previousState may be
            // "managed" (auto-published) rather than "absent".
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("bundled install by name with previousState managed", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const ooDir = resolveManagedSkillDirectoryPath(homeDirectory, "oo");

            await mkdir(ooDir, { recursive: true });
            await writeFile(join(ooDir, "SKILL.md"), "# managed\n");
            await writeFile(
                resolveManagedSkillMetadataFilePath(ooDir),
                renderSkillMetadataJson(createBundledSkillMetadata(TEST_CLI_VERSION)),
            );

            const result = await sandbox.run(
                ["skills", "install", "oo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooSkill = skills.find(s => s.skillId === "oo");

            expect(ooSkill).toBeDefined();
            const targets = ooSkill!.targets as Array<Record<string, unknown>>;
            const universalTarget = targets.find(t => t.agentId === "universal");

            expect(universalTarget).toMatchObject({
                status: "installed",
                previousState: "managed",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("bundled install with --force overwrites unmanaged target with previousState unmanaged", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const ooDir = resolveManagedSkillDirectoryPath(homeDirectory, "oo");

            await mkdir(ooDir, { recursive: true });
            await writeFile(join(ooDir, "SKILL.md"), "# user\n");

            const result = await sandbox.run(
                ["skills", "install", "oo", "--force", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooSkill = skills.find(s => s.skillId === "oo");

            expect(ooSkill).toBeDefined();
            const targets = ooSkill!.targets as Array<Record<string, unknown>>;
            const universalTarget = targets.find(t => t.agentId === "universal");

            expect(universalTarget).toMatchObject({
                status: "installed",
                previousState: "unmanaged",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("invalid package specifier returns command-level error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "##bad", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors[0]).toMatchObject({ code: "invalid_package_specifier" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("registry install package_lookup_failed surfaces as a command-level error", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "@alice/demo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => new Response("err", { status: 500 }),
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(0);
            expect(errors[0]).toMatchObject({ code: "package_lookup_failed" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "install", "--format", "xml"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("error.message uses fixed template and does not leak raw error / secret", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "@alice/demo", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async () => {
                        throw new Error("secret-token: do-not-leak");
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).not.toContain("secret-token");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const errors = payload.errors as Array<Record<string, unknown>>;
            const errMsg = errors[0]!.message as string;

            expect(errMsg).not.toContain("secret-token");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "--json", "--show-schema-version"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload.command).toBe("skills.install");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--skill narrows the bundled install to the matched skills case-insensitively", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "--skill", "OO", "missing", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            // Only the matched bundled skill is installed; the unknown "missing"
            // token is silently ignored and the other bundled skills are skipped.
            expect(skills.map(skill => skill.skillId)).toEqual(["oo"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--skill with no matching bundled skill reports skill_filter_no_match and exits 1", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "--skill", "nope", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(0);
            expect(errors[0]).toMatchObject({ code: "skill_filter_no_match" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--skill that matches no published skill in a registry package reports skill_filter_no_match", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            // The filter excludes every published skill after package-info loads
            // but before any archive download, so no tarball fetch is needed.
            const result = await sandbox.run(
                ["skills", "install", "@alice/demo", "--skill", "nope", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            return packageInfoResponse("@alice/demo", "0.1.0", "demo");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(0);
            expect(errors[0]).toMatchObject({ code: "skill_filter_no_match" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("multiple packages with --skill matching none fail once globally, not per package", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const lookedUpPackages: string[] = [];
            // Package names BEFORE -s, so both are positional packages and the
            // variadic -s collects only the skill tokens.
            const result = await sandbox.run(
                ["skills", "install", "@alice/foo", "@alice/bar", "-s", "nope", "--json"],
                {
                    version: TEST_CLI_VERSION,
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/package-info/")) {
                            if (request.url.includes("foo")) {
                                lookedUpPackages.push("foo");
                                return packageInfoResponse("@alice/foo", "0.1.0", "foo");
                            }
                            if (request.url.includes("bar")) {
                                lookedUpPackages.push("bar");
                                return packageInfoResponse("@alice/bar", "0.1.0", "bar");
                            }
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            // Both positional args are treated as packages (both looked up), and
            // "nope" is never treated as a package. The --skill filter spans all
            // packages: nothing matches anywhere, so the command fails ONCE with a
            // single global skill_filter_no_match (not one error per package).
            expect(lookedUpPackages.sort()).toEqual(["bar", "foo"]);
            expect(skills).toHaveLength(0);
            expect(errors.map(error => error.code)).toEqual(["skill_filter_no_match"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text mode: --skill with no matching bundled skill exits 1 and lists available skills", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            // No --json: the no-arg bundled path throws a CliUserError that the
            // CLI renders to stderr and exits 1.
            const result = await sandbox.run(
                ["skills", "install", "--skill", "nope"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            // The error lists the available bundled skills.
            expect(result.stderr).toContain("oo");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
