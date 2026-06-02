import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
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

    test("registry install package_lookup_failed surfaces as skill-level failure when --skill is set", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "install", "@alice/demo", "--skill", "demo", "--json"],
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
                status: "failed",
                error: { code: "package_lookup_failed" },
            });
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
                ["skills", "install", "@alice/demo", "--skill", "demo", "--json"],
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
            const skills = payload.skills as Array<Record<string, unknown>>;
            const errMsg = (skills[0]!.error as Record<string, unknown>).message as string;

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
});
