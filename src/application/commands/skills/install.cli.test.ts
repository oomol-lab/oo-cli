import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

    test("an explicitly named bundled target keeps the install successful when --skill misses the registry package", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

            await mkdir(homeDirectory, { recursive: true });

            // `oo` is an explicit bundled target (never narrowed by --skill) and
            // installs; @alice/demo is a registry package whose only skill does
            // not match "nope". Because the bundled skill installed, the run does
            // NOT fail with skill_filter_no_match.
            const result = await sandbox.run(
                ["skills", "install", "oo", "@alice/demo", "--skill", "nope", "--json"],
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

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const errors = payload.errors as Array<Record<string, unknown>>;

            expect(payload.status).toBe("completed");
            expect(skills.map(skill => skill.skillId)).toEqual(["oo"]);
            expect(skills[0]).toMatchObject({ kind: "bundled", status: "installed" });
            expect(errors).toHaveLength(0);
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

describe("skills install --out-dir export", () => {
    // The export tests omit `version`, so the CLI runs as a development build and
    // startup auto-sync is skipped. That keeps the agent homes and app-data
    // canonical storage untouched, letting the tests assert the export's purity.
    const allBundledSkillNames = [
        "oo",
        "oo-find-skills",
        "oo-create-skill",
        "oo-publish-skill",
    ];

    test("exports all bundled skills into the directory without touching agent homes", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            // Disable startup auto-sync so the only skill writes come from the
            // export command itself, isolating its purity from the unrelated
            // bundled-skill startup synchronization.
            sandbox.env.OO_SKILLS_SYNC_DISABLED = "1";

            const result = await sandbox.run(["skills", "add", "--out-dir", outDir]);

            expect(result.exitCode).toBe(0);

            for (const skillName of allBundledSkillNames) {
                expect(
                    await pathExists(join(outDir, skillName, "SKILL.md")),
                ).toBeTrue();
            }

            // The default format equals the universal `~/.agents` format, which
            // has no host-specific frontmatter.
            const ooSkill = await readFile(join(outDir, "oo", "SKILL.md"), "utf8");

            expect(ooSkill).not.toContain("allowed-tools");

            // Pure export: nothing is published to any agent home. The
            // always-provision universal host would be written first if the
            // export wrongly fell back to the install path.
            const universalHome = resolveManagedSkillAgentHomeDirectory(
                sandbox.env,
                "universal",
            );
            const claudeHome = resolveManagedSkillAgentHomeDirectory(
                sandbox.env,
                "claude",
            );

            expect(await pathExists(join(universalHome, "skills"))).toBeFalse();
            expect(await pathExists(join(claudeHome, "skills"))).toBeFalse();
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("renders the requested agent format", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "--out-dir",
                outDir,
                "--agent-format",
                "claude",
            ]);

            expect(result.exitCode).toBe(0);
            const ooSkill = await readFile(join(outDir, "oo", "SKILL.md"), "utf8");

            expect(ooSkill).toContain("allowed-tools: [Bash(oo *)]");
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("defaults the agent format to universal when --agent-format is omitted", async () => {
        const sandbox = await createCliSandbox();
        const omittedDir = await mkdtemp(join(tmpdir(), "oo-out-omitted-"));
        const universalDir = await mkdtemp(join(tmpdir(), "oo-out-universal-"));

        try {
            const omittedResult = await sandbox.run([
                "skills",
                "add",
                "oo",
                "--out-dir",
                omittedDir,
            ]);
            const universalResult = await sandbox.run([
                "skills",
                "add",
                "oo",
                "--out-dir",
                universalDir,
                "--agent-format",
                "universal",
            ]);

            expect(omittedResult.exitCode).toBe(0);
            expect(universalResult.exitCode).toBe(0);
            expect(await readFile(join(omittedDir, "oo", "SKILL.md"), "utf8")).toBe(
                await readFile(join(universalDir, "oo", "SKILL.md"), "utf8"),
            );
        }
        finally {
            await rm(omittedDir, { force: true, recursive: true });
            await rm(universalDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("rejects the removed default agent-format alias", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "--out-dir",
                outDir,
                "--agent-format",
                "default",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("Unsupported agent format");
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("narrows the export with --skill", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "--out-dir",
                outDir,
                "--skill",
                "oo",
            ]);

            expect(result.exitCode).toBe(0);
            expect(await pathExists(join(outDir, "oo", "SKILL.md"))).toBeTrue();
            expect(await pathExists(join(outDir, "oo-find-skills"))).toBeFalse();
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("exports an explicitly named bundled skill", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "oo-create-skill",
                "--out-dir",
                outDir,
            ]);

            expect(result.exitCode).toBe(0);
            expect(
                await pathExists(join(outDir, "oo-create-skill", "SKILL.md")),
            ).toBeTrue();
            expect(await pathExists(join(outDir, "oo"))).toBeFalse();
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("fails when --skill matches no bundled skill", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "--out-dir",
                outDir,
                "--skill",
                "nope",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("None of the requested skills exist");
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("rejects a non-bundled package name in export mode", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "not-a-bundled-skill",
                "--out-dir",
                outDir,
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("is not a bundled skill");
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("rejects --agent-format without --out-dir", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "--agent-format",
                "claude",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("--out-dir");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects an unsupported agent format", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "--out-dir",
                outDir,
                "--agent-format",
                "bogus",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("Unsupported agent format");
            // The error lists the accepted agents (no `default` alias).
            expect(result.stderr).toContain("universal");
            expect(result.stderr).not.toContain("default");
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });

    test("emits a structured JSON export report", async () => {
        const sandbox = await createCliSandbox();
        const outDir = await mkdtemp(join(tmpdir(), "oo-out-"));

        try {
            const result = await sandbox.run([
                "skills",
                "add",
                "oo",
                "--out-dir",
                outDir,
                "--json",
            ]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.command).toBe("skills.install.export");
            expect(payload.status).toBe("completed");
            expect(payload.agentFormat).toBe("universal");
            expect(payload.outputDirectory).toBe(outDir);
            expect(payload.summary).toMatchObject({
                requestedSkills: 1,
                exported: 1,
                failed: 0,
            });
            const skills = payload.skills as Array<Record<string, unknown>>;

            expect(skills).toHaveLength(1);
            expect(skills[0]).toMatchObject({
                skillId: "oo",
                status: "exported",
                path: join(outDir, "oo"),
            });
            expect(skills[0]!.files).toContain("SKILL.md");
        }
        finally {
            await rm(outDir, { force: true, recursive: true });
            await sandbox.cleanup();
        }
    });
});

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
