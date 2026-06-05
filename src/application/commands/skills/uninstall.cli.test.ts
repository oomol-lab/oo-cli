import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { seedRegistrySkill } from "./__tests__/helpers.ts";
import { resolveBundledSkillCanonicalDirectoryPath } from "./bundled-skill-paths.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

const TEST_CLI_VERSION = "9.9.9";

async function seedBundledSkill(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
    skillName: string,
    agent: "universal" | "claude" = "universal",
): Promise<{ hostDirectory: string; canonicalDirectory: string }> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, agent);
    const hostDirectory = resolveManagedSkillDirectoryPath(homeDirectory, skillName);
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: sandbox.env,
        platform: process.platform,
    });
    const canonicalDirectory = resolveBundledSkillCanonicalDirectoryPath(
        storePaths.settingsFilePath,
        skillName as never,
        agent,
    );

    await mkdir(hostDirectory, { recursive: true });
    await mkdir(canonicalDirectory, { recursive: true });
    await writeFile(join(hostDirectory, "SKILL.md"), "# bundled\n");
    await writeFile(join(canonicalDirectory, "SKILL.md"), "# bundled\n");
    await writeFile(
        resolveManagedSkillMetadataFilePath(hostDirectory),
        renderSkillMetadataJson(createBundledSkillMetadata(TEST_CLI_VERSION)),
    );
    await writeFile(
        resolveManagedSkillMetadataFilePath(canonicalDirectory),
        renderSkillMetadataJson(createBundledSkillMetadata(TEST_CLI_VERSION)),
    );

    return { hostDirectory, canonicalDirectory };
}

async function seedLocalSkill(options: {
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>;
    skillName: string;
    agent: "universal" | "claude";
}): Promise<{ path: string }> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(options.sandbox.env, options.agent);
    const path = resolveManagedSkillDirectoryPath(homeDirectory, options.skillName);

    await mkdir(path, { recursive: true });
    await writeFile(join(path, "SKILL.md"), "# local\n");
    await writeFile(
        resolveManagedSkillMetadataFilePath(path),
        renderSkillMetadataJson(createLocalSkillMetadata()),
    );

    return { path };
}

describe("skills uninstall --json", () => {
    test("registry uninstall returns removed result with per-target detail", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "demo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.uninstall");
            expect(payload.status).toBe("completed");
            expect((payload.summary as Record<string, number>).removed).toBe(1);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(1);
            expect(skills[0]).toMatchObject({
                skillId: "demo",
                kind: "registry",
                packageName: "@alice/demo",
                previousVersion: "0.2.0",
                status: "removed",
            });
            const targets = skills[0]!.targets as Array<Record<string, unknown>>;

            expect(targets).toHaveLength(1);
            expect(targets[0]).toMatchObject({
                agentId: "universal",
                status: "removed",
                previousVersion: "0.2.0",
                previousState: "managed",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("bundled uninstall by name removes target", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedBundledSkill(sandbox, "oo");

            const result = await sandbox.run(
                ["skills", "uninstall", "oo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "oo",
                kind: "bundled",
                status: "removed",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("skill not installed returns failed with not_installed code", async () => {
        const sandbox = await createCliSandbox();

        try {
            // Create an agent home so we don't trigger no_supported_hosts
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            const result = await sandbox.run(
                ["skills", "uninstall", "ghost", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("failed");
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "ghost",
                status: "failed",
                error: { code: "not_installed" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("universal host is always available without a home directory", async () => {
        const sandbox = await createCliSandbox();

        try {
            // The universal host is always provisioned, so even with no agent
            // home directory on disk the command never reports
            // no_supported_hosts; an uninstalled skill is reported as
            // not_installed instead.
            const result = await sandbox.run(
                ["skills", "uninstall", "demo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("failed");
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(errors).toHaveLength(0);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "demo",
                status: "failed",
                error: { code: "not_installed" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("unmanaged same-name directory returns failed with not_managed code", async () => {
        const sandbox = await createCliSandbox();

        try {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const skillDir = resolveManagedSkillDirectoryPath(homeDirectory, "demo");

            await mkdir(skillDir, { recursive: true });
            await writeFile(join(skillDir, "SKILL.md"), "# user\n");

            const result = await sandbox.run(
                ["skills", "uninstall", "demo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                status: "failed",
                error: { code: "not_managed" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("local skill ambiguous across agents returns ambiguous_local_skill", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedLocalSkill({ sandbox, skillName: "local-demo", agent: "universal" });
            await seedLocalSkill({ sandbox, skillName: "local-demo", agent: "claude" });

            const result = await sandbox.run(
                ["skills", "uninstall", "local-demo", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                kind: "local",
                status: "failed",
                error: { code: "ambiguous_local_skill" },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("local skill uninstall with --agent removes it", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedLocalSkill({ sandbox, skillName: "local-demo", agent: "universal" });

            const result = await sandbox.run(
                ["skills", "uninstall", "local-demo", "--agent", "universal", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                kind: "local",
                status: "removed",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("scoped package name removes every installed skill that belongs to it", async () => {
        const sandbox = await createCliSandbox();

        try {
            const first = await seedRegistrySkill({
                sandbox,
                skillName: "alpha",
                packageName: "@scope/pkg",
                version: "1.0.0",
            });
            const second = await seedRegistrySkill({
                sandbox,
                skillName: "beta",
                packageName: "@scope/pkg",
                version: "1.0.0",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "@scope/pkg", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("completed");
            const summary = payload.summary as Record<string, number>;

            expect(summary.requestedSkills).toBe(1);
            expect(summary.removed).toBe(2);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(2);
            expect(skills.map(skill => skill.skillId).sort()).toEqual(["alpha", "beta"]);
            for (const skill of skills) {
                expect(skill).toMatchObject({
                    kind: "registry",
                    packageName: "@scope/pkg",
                    status: "removed",
                });
            }
            await expect(stat(first.hostDirectory)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(second.hostDirectory)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("a name that matches no skill falls back to package removal", async () => {
        const sandbox = await createCliSandbox();

        try {
            const seeded = await seedRegistrySkill({
                sandbox,
                skillName: "solo",
                packageName: "toolbox",
                version: "2.0.0",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "toolbox", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect((payload.summary as Record<string, number>).removed).toBe(1);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "solo",
                kind: "registry",
                packageName: "toolbox",
                status: "removed",
            });
            await expect(stat(seeded.hostDirectory)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("removing a package leaves same-name skills owned by other packages intact", async () => {
        const sandbox = await createCliSandbox();

        try {
            const seeded = await seedRegistrySkill({
                sandbox,
                skillName: "foo",
                packageName: "@owner/pkg-one",
                version: "1.0.0",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "pkg-two", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("failed");
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills[0]).toMatchObject({
                skillId: "pkg-two",
                status: "failed",
                error: { code: "not_installed" },
            });
            // foo belongs to a different package and must remain installed.
            await expect(stat(seeded.hostDirectory)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("mixed skill and package names are each resolved", async () => {
        const sandbox = await createCliSandbox();

        try {
            const inner = await seedRegistrySkill({
                sandbox,
                skillName: "inner",
                packageName: "@scope/bundle",
                version: "1.0.0",
            });
            const bar = await seedRegistrySkill({
                sandbox,
                skillName: "bar",
                packageName: "@scope/bar",
                version: "1.0.0",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "@scope/bundle", "bar", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const summary = payload.summary as Record<string, number>;

            expect(summary.requestedSkills).toBe(2);
            expect(summary.removed).toBe(2);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills.map(skill => skill.skillId).sort()).toEqual(["bar", "inner"]);
            await expect(stat(inner.hostDirectory)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(bar.hostDirectory)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("removes both a registry and a same-name local skill", async () => {
        const sandbox = await createCliSandbox();

        try {
            const registry = await seedRegistrySkill({
                sandbox,
                skillName: "dual",
                packageName: "@scope/dual",
                version: "1.0.0",
                agent: "claude",
            });
            const local = await seedLocalSkill({
                sandbox,
                skillName: "dual",
                agent: "universal",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "dual", "--json"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("completed");
            expect((payload.summary as Record<string, number>).removed).toBe(2);
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills.map(skill => skill.kind).sort()).toEqual(["local", "registry"]);
            for (const skill of skills) {
                expect(skill.status).toBe("removed");
            }
            await expect(stat(registry.hostDirectory)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(local.path)).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedRegistrySkill({
                sandbox,
                skillName: "demo",
                packageName: "@alice/demo",
                version: "0.2.0",
            });

            const result = await sandbox.run(
                ["skills", "uninstall", "demo", "--json", "--show-schema-version"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload.command).toBe("skills.uninstall");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2 without JSON", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "uninstall", "demo", "--format", "xml"],
                { version: TEST_CLI_VERSION },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
