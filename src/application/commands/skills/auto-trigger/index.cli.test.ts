import type { CliSandbox } from "../../../../../__tests__/helpers.ts";
import type { BundledSkillAgentName, BundledSkillName } from "../embedded-assets.ts";

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../../telemetry/outbox.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillCanonicalRootDirectoryPath,
} from "../bundled-skill-paths.ts";
import { resolveManagedSkillAgentHomeDirectory } from "../managed-skill-agents.ts";

describe("skills auto-trigger CLI", () => {
    test("--json reports every bundled skill as auto-triggering by default", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "auto-trigger", "status", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                disabled: [],
                disabledAll: false,
                skills: [
                    { autoTrigger: true, name: "oo", reason: "default" },
                    { autoTrigger: true, name: "oo-find-skills", reason: "default" },
                    { autoTrigger: true, name: "oo-create-skill", reason: "default" },
                    { autoTrigger: true, name: "oo-publish-skill", reason: "default" },
                ],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("off --all flips both vendor markers in every host", async () => {
        const sandbox = await createCliSandbox();

        try {
            await createClaudeHome(sandbox);

            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "--all", "--json"],
            );
            const payload = JSON.parse(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(payload.disabledAll).toBeTrue();
            expect(payload.disabled).toEqual([]);
            expect(payload.skills.every((skill: { autoTrigger: boolean }) =>
                !skill.autoTrigger,
            )).toBeTrue();
            expect(payload.publications).toHaveLength(8);
            expect(payload.publications.every((publication: { status: string }) =>
                publication.status === "published",
            )).toBeTrue();

            for (const agentName of ["universal", "claude"] as const) {
                expect(
                    await readSkillMarkdown(sandbox, agentName, "oo"),
                ).toContain("disable-model-invocation: true");
                expect(
                    await readOpenAiPolicy(sandbox, agentName, "oo"),
                ).toContain("allow_implicit_invocation: false");
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("off with a skill name leaves the other bundled skills alone", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "oo-create-skill", "--json"],
            );
            const payload = JSON.parse(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(payload.disabledAll).toBeFalse();
            expect(payload.disabled).toEqual(["oo-create-skill"]);
            expect(
                await readSkillMarkdown(sandbox, "universal", "oo-create-skill"),
            ).toContain("disable-model-invocation: true");
            expect(
                await readSkillMarkdown(sandbox, "universal", "oo"),
            ).toContain("disable-model-invocation: false");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("on --all clears the standing policy and the per-skill list together", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "off", "oo-create-skill"]);
            await sandbox.run(["skills", "auto-trigger", "off", "--all"]);

            const result = await sandbox.run(
                ["skills", "auto-trigger", "on", "--all", "--json"],
            );
            const payload = JSON.parse(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(payload.disabledAll).toBeFalse();
            expect(payload.disabled).toEqual([]);
            expect(
                await readSkillMarkdown(sandbox, "universal", "oo-create-skill"),
            ).toContain("disable-model-invocation: false");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("on with a skill name removes only that entry", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run([
                "skills",
                "auto-trigger",
                "off",
                "oo-create-skill",
                "oo-publish-skill",
            ]);

            const result = await sandbox.run(
                ["skills", "auto-trigger", "on", "oo-create-skill", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).disabled).toEqual(["oo-publish-skill"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repeating off is idempotent", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "off", "oo-create-skill"]);
            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "oo-create-skill", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).disabled).toEqual(["oo-create-skill"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects passing both skill names and --all", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "oo", "--all"],
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("not both");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects passing neither skill names nor --all", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "auto-trigger", "on"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("at least one");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects a skill name that is not bundled", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "oo-gmail"],
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("Unknown bundled skill: oo-gmail.");
            expect(result.stderr).toContain("oo-publish-skill");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // A bundled skill dropped by a later release would otherwise be stuck in the
    // settings file: `off` will not name it, and `on --all` is too blunt.
    test("lets on remove a stored name that is no longer a bundled skill", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "status"]);

            const settingsFilePath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).settingsFilePath;

            await Bun.write(
                settingsFilePath,
                `${await Bun.file(settingsFilePath).text()}\n[skills.auto_trigger]\ndisabled = ["oo-retired-skill", "oo"]\n`,
            );

            const result = await sandbox.run(
                ["skills", "auto-trigger", "on", "oo-retired-skill", "--json"],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout).disabled).toEqual(["oo"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("off still rejects a name that is not a bundled skill", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "status"]);

            const settingsFilePath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).settingsFilePath;

            await Bun.write(
                settingsFilePath,
                `${await Bun.file(settingsFilePath).text()}\n[skills.auto_trigger]\ndisabled = ["oo-retired-skill"]\n`,
            );

            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "oo-retired-skill"],
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("Unknown bundled skill: oo-retired-skill.");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("skips a same-name host directory that oo does not manage", async () => {
        const sandbox = await createCliSandbox();

        try {
            const claudeHomeDirectory = await createClaudeHome(sandbox);

            await mkdir(join(claudeHomeDirectory, "skills", "oo"), { recursive: true });
            await Bun.write(
                join(claudeHomeDirectory, "skills", "oo", "SKILL.md"),
                "---\nname: oo\ndescription: hand written\n---\n",
            );

            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "--all", "--json"],
            );
            const payload = JSON.parse(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(payload.publications).toContainEqual({
                agent: "claude",
                skill: "oo",
                status: "skipped",
            });
            expect(
                await readSkillMarkdown(sandbox, "claude", "oo"),
            ).toBe("---\nname: oo\ndescription: hand written\n---\n");
            expect(
                await readSkillMarkdown(sandbox, "universal", "oo"),
            ).toContain("disable-model-invocation: true");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("names the skipped targets in text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const claudeHomeDirectory = await createClaudeHome(sandbox);

            await mkdir(join(claudeHomeDirectory, "skills", "oo"), { recursive: true });
            await Bun.write(
                join(claudeHomeDirectory, "skills", "oo", "SKILL.md"),
                "---\nname: oo\n---\n",
            );

            const result = await sandbox.run(["skills", "auto-trigger", "off", "--all"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Every bundled skill is now manual-only.");
            expect(result.stdout).toContain("skipped 1 target(s) not managed by oo");
            expect(result.stdout).toContain("Claude Code/oo");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps the canonical copy in step with the host copy", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "off", "--all"]);

            const canonicalDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
                resolveStorePaths({
                    appName: APP_NAME,
                    env: sandbox.env,
                    platform: process.platform,
                }).settingsFilePath,
                "oo",
                "universal",
            );

            expect(
                await Bun.file(join(canonicalDirectoryPath, "SKILL.md")).text(),
            ).toBe(await readSkillMarkdown(sandbox, "universal", "oo"));
            expect(
                await Bun.file(
                    join(canonicalDirectoryPath, "agents", "openai.yaml"),
                ).text(),
            ).toContain("allow_implicit_invocation: false");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // `oo skills install` resolves the policy through its own read rather than
    // through the auto-trigger command, so a skill installed into a host that
    // appeared after the policy was set must still come out manual-only.
    test("installs into a newly detected host with the stored policy applied", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "off", "--all"]);
            await createClaudeHome(sandbox);

            const result = await sandbox.run(["skills", "install"]);

            expect(result.exitCode).toBe(0);
            expect(
                await readSkillMarkdown(sandbox, "claude", "oo"),
            ).toContain("disable-model-invocation: true");
            expect(
                await readOpenAiPolicy(sandbox, "claude", "oo"),
            ).toContain("allow_implicit_invocation: false");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // The documented escape hatch: startup synchronization deliberately ignores
    // a hand-edited policy, so `oo skills repair` has to be the thing that
    // applies it. If that stops working the setting silently never takes.
    test("applies a hand-edited policy through oo skills repair", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "status"]);

            const settingsFilePath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).settingsFilePath;

            await Bun.write(
                settingsFilePath,
                `${await Bun.file(settingsFilePath).text()}\n[skills.auto_trigger]\ndisabled = ["oo-create-skill"]\n`,
            );

            expect(
                await readSkillMarkdown(sandbox, "universal", "oo-create-skill"),
            ).toContain("disable-model-invocation: false");

            const result = await sandbox.run(
                ["skills", "repair", "--skill", "oo-create-skill"],
            );

            expect(result.exitCode).toBe(0);
            expect(
                await readSkillMarkdown(sandbox, "universal", "oo-create-skill"),
            ).toContain("disable-model-invocation: true");
            expect(
                await readOpenAiPolicy(sandbox, "universal", "oo-create-skill"),
            ).toContain("allow_implicit_invocation: false");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // Without this note the success line reads as though the skill went back to
    // auto-triggering, while `disabled_all` is still suppressing every skill.
    test("says the standing policy still applies after a per-skill on", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "off", "--all"]);
            const result = await sandbox.run(["skills", "auto-trigger", "on", "oo"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "every bundled skill stays manual-only",
            );
            expect(
                await readSkillMarkdown(sandbox, "universal", "oo"),
            ).toContain("disable-model-invocation: true");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("omits the standing policy note when no standing policy is set", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "oo-create-skill"],
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("stays manual-only");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // The manifest in telemetry-decisions.test.ts only checks the declared
    // names against the forbidden lists; nothing there observes the real call,
    // so the recorded shape is asserted here.
    test("records only bucketed auto-trigger dimensions, never skill names", async () => {
        const sandbox = await createCliSandbox();

        try {
            const storePaths = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            });

            await sandbox.run(["skills", "auto-trigger", "off", "oo-create-skill"]);

            const properties = readCommandTelemetryProperties(
                storePaths.telemetryDirectory,
            );

            expect(properties).toMatchObject({
                command_full: "skills.auto-trigger.off",
                skill_count_bucket: "1-5",
                target_scope: "skills",
            });

            for (const forbidden of [
                "disabled",
                "skill_ids_sample",
                "skill_name",
                "skill_names",
                "skills",
            ]) {
                expect(properties).not.toHaveProperty(forbidden);
            }

            expect(JSON.stringify(properties)).not.toContain("oo-create-skill");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records the standing policy flag and a bucketed count from status", async () => {
        const sandbox = await createCliSandbox();

        try {
            const storePaths = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            });

            await sandbox.run(["skills", "auto-trigger", "off", "--all"]);
            await sandbox.run(["skills", "auto-trigger", "status"]);

            const properties = readCommandTelemetryProperties(
                storePaths.telemetryDirectory,
            );

            expect(properties).toMatchObject({
                command_full: "skills.auto-trigger.status",
                disabled_all: true,
                disabled_count_bucket: "0",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // The half-applied state is the whole reason this command exits non-zero.
    // Pins four things at once: the JSON payload is emitted BEFORE the throw so
    // a script still learns which targets were left auto-triggering, the exit
    // code is 1 rather than 2, the recovery hint names the failed skills (a
    // bare `oo skills repair` exits 2), and the saved setting survives.
    test("reports the half-applied state and exits 1 when publication fails", async () => {
        const sandbox = await createCliSandbox();

        try {
            const canonicalRootDirectoryPath
                = resolveBundledSkillCanonicalRootDirectoryPath(
                    resolveStorePaths({
                        appName: APP_NAME,
                        env: sandbox.env,
                        platform: process.platform,
                    }).settingsFilePath,
                    "universal",
                );

            // A regular file where the canonical root directory belongs makes
            // every universal publication fail without needing permission bits,
            // which do not behave the same way across platforms and CI users.
            await mkdir(dirname(canonicalRootDirectoryPath), { recursive: true });
            await Bun.write(canonicalRootDirectoryPath, "not a directory");

            const result = await sandbox.run(
                ["skills", "auto-trigger", "off", "--all", "--json"],
            );
            const payload = JSON.parse(result.stdout);

            expect(result.exitCode).toBe(1);
            expect(payload.disabledAll).toBeTrue();
            expect(
                payload.publications.filter(
                    (publication: { status: string }) => publication.status === "failed",
                ),
            ).toHaveLength(4);
            expect(result.stderr).toContain("could not be republished");
            expect(result.stderr).toContain("oo skills repair --skill oo");

            const status = await sandbox.run(
                ["skills", "auto-trigger", "status", "--json"],
            );

            expect(JSON.parse(status.stdout).disabledAll).toBeTrue();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status reports the reason each skill ended up manual-only", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(["skills", "auto-trigger", "off", "oo-create-skill"]);
            const result = await sandbox.run(["skills", "auto-trigger", "status"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Auto-trigger is off for 1 bundled skill(s).");
            expect(result.stdout).toContain("oo: auto");
            expect(result.stdout).toContain("oo-create-skill: manual");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

// The command event is the last row written by the invocation under test.
function readCommandTelemetryProperties(
    telemetryDirectory: string,
): Record<string, unknown> {
    const row = readTelemetryRowsForTest(telemetryDirectory).at(-1);

    if (row === undefined) {
        throw new Error("No telemetry row was recorded.");
    }

    const payload = parseTelemetryRowPayload(row);

    if (payload === undefined) {
        throw new Error("The telemetry row payload could not be parsed.");
    }

    return payload.properties as Record<string, unknown>;
}

async function createClaudeHome(sandbox: CliSandbox): Promise<string> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");

    await mkdir(homeDirectory, { recursive: true });

    return homeDirectory;
}

async function readSkillMarkdown(
    sandbox: CliSandbox,
    agentName: BundledSkillAgentName,
    skillName: BundledSkillName,
): Promise<string> {
    return await readHostSkillFile(sandbox, agentName, skillName, "SKILL.md");
}

async function readOpenAiPolicy(
    sandbox: CliSandbox,
    agentName: BundledSkillAgentName,
    skillName: BundledSkillName,
): Promise<string> {
    return await readHostSkillFile(
        sandbox,
        agentName,
        skillName,
        join("agents", "openai.yaml"),
    );
}

async function readHostSkillFile(
    sandbox: CliSandbox,
    agentName: BundledSkillAgentName,
    skillName: BundledSkillName,
    relativePath: string,
): Promise<string> {
    return await Bun.file(
        join(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, agentName),
            "skills",
            skillName,
            relativePath,
        ),
    ).text();
}
