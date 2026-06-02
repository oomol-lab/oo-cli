import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, test } from "bun:test";
import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { resolveBundledSkillCanonicalDirectoryPath } from "./bundled-skill-paths.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

const TEST_CLI_VERSION = "9.9.9";

describe("skills repair CLI", () => {
    test("rejects when --skill is not provided", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            const result = await sandbox.run(["skills", "repair"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("--skill");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair --skill oo --agent universal overwrites a modified bundled host directory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });
            await writeFile(join(ooSkillDirectory, "SKILL.md"), "tampered content\n");

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const repairedContent = await readFile(join(ooSkillDirectory, "SKILL.md"), "utf8");

            expect(repairedContent).not.toBe("tampered content\n");
            expect(repairedContent.length).toBeGreaterThan(50);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair overwrites an unmanaged same-name host directory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");

        try {
            await mkdir(ooSkillDirectory, { recursive: true });
            await writeFile(join(ooSkillDirectory, "SKILL.md"), "user content\n");

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const metadataPath = resolveManagedSkillMetadataFilePath(ooSkillDirectory);
            const metadataContent = await readFile(metadataPath, "utf8");

            expect(metadataContent).toContain("\"kind\": \"bundled\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair re-materializes a poisoned bundled canonical source", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalDirectory = resolveBundledSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "oo",
            "universal",
        );
        const hostDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });
            await rm(canonicalDirectory, { recursive: true, force: true });
            await mkdir(canonicalDirectory, { recursive: true });
            await writeFile(join(canonicalDirectory, "polluted.txt"), "junk\n");

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            const canonicalMetadataPath = resolveManagedSkillMetadataFilePath(canonicalDirectory);
            const canonicalMetadataContent = await readFile(canonicalMetadataPath, "utf8");

            expect(canonicalMetadataContent).toContain("\"kind\": \"bundled\"");
            expect((await readFile(join(hostDirectory, "SKILL.md"), "utf8")).length)
                .toBeGreaterThan(50);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair defaults to all available supported agents when --agent is omitted", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalSkillDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");
        const claudeSkillDirectory = resolveManagedSkillDirectoryPath(claudeHomeDirectory, "oo");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(claudeHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: TEST_CLI_VERSION });
            await writeFile(join(universalSkillDirectory, "SKILL.md"), "tampered universal\n");
            await writeFile(join(claudeSkillDirectory, "SKILL.md"), "tampered claude\n");

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "oo",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            const universalContent = await readFile(join(universalSkillDirectory, "SKILL.md"), "utf8");
            const claudeContent = await readFile(join(claudeSkillDirectory, "SKILL.md"), "utf8");

            expect(universalContent).not.toBe("tampered universal\n");
            expect(claudeContent).not.toBe("tampered claude\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair runs the cartesian product of multiple --agent and --skill, de-duplicated", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(claudeHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: TEST_CLI_VERSION });

            const result = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--skill",
                "oo",
                "--skill",
                "oo",
                "--skill",
                "oo-find-skills",
                "--agent",
                "universal",
                "--agent",
                "claude",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.summary).toMatchObject({
                requestedSkills: 2,
                targetAgents: 2,
                repaired: 4,
                failed: 0,
            });
            const results = payload.results as Array<Record<string, unknown>>;

            expect(results).toHaveLength(4);
            const pairKeys = results.map(entry => `${entry.skill}|${entry.agentId}`).sort();

            expect(pairKeys).toEqual([
                "oo-find-skills|claude",
                "oo-find-skills|universal",
                "oo|claude",
                "oo|universal",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair surfaces missing source as per-pair failure (--json includes failed result)", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            const result = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--skill",
                "nonexistent-skill",
                "--agent",
                "universal",
            ]);

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.summary).toMatchObject({
                requestedSkills: 1,
                targetAgents: 1,
                repaired: 0,
                failed: 1,
            });
            const results = payload.results as Array<Record<string, unknown>>;

            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                skill: "nonexistent-skill",
                status: "failed",
            });
            expect((results[0]!.error as Record<string, unknown>).code).toBe("source_not_found");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair valid + missing skill: valid is repaired and missing surfaces as failed entry", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });
            await writeFile(join(ooSkillDirectory, "SKILL.md"), "tampered\n");

            const result = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--skill",
                "oo",
                "--skill",
                "nonexistent",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.summary).toMatchObject({
                requestedSkills: 2,
                targetAgents: 1,
                repaired: 1,
                failed: 1,
            });
            expect(await readFile(join(ooSkillDirectory, "SKILL.md"), "utf8"))
                .not
                .toBe("tampered\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair surfaces invalid registry canonical metadata as source_invalid", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalDirectory = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "broken-skill",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(canonicalDirectory, { recursive: true });
            await writeFile(join(canonicalDirectory, "SKILL.md"), "# Broken\n");
            await writeFile(
                resolveManagedSkillMetadataFilePath(canonicalDirectory),
                "not-valid-json{{",
            );

            const result = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--skill",
                "broken-skill",
                "--agent",
                "universal",
            ]);

            expect(result.exitCode).toBe(1);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const results = payload.results as Array<Record<string, unknown>>;

            expect(results).toHaveLength(1);
            expect((results[0]!.error as Record<string, unknown>).code).toBe("source_invalid");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair fails with localUnsupported when skill only exists as a local skill", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const localSkillDirectory = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "campaign-writer",
        );

        try {
            await mkdir(localSkillDirectory, { recursive: true });
            await writeFile(
                join(localSkillDirectory, "SKILL.md"),
                "---\nname: campaign-writer\ndescription: A local skill.\n---\n",
            );
            await writeFile(
                resolveManagedSkillMetadataFilePath(localSkillDirectory),
                renderSkillMetadataJson(createLocalSkillMetadata()),
            );

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "campaign-writer",
                "--agent",
                "universal",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("campaign-writer");
            expect(result.stderr).toContain("local skill");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair fails when explicit --agent home directory does not exist", async () => {
        const sandbox = await createCliSandbox();

        try {
            // The universal host is always provisioned, so it can never be
            // "not installed". Use hermes, which only becomes available once its
            // home directory exists on disk, to exercise the missing-home path.
            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "oo",
                "--agent",
                "hermes",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr.toLowerCase()).toContain("hermes");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair --skill registry-skill from canonical never invokes HTTP", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalDirectory = resolveManagedSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "alpha-skill",
        );
        const hostDirectory = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(canonicalDirectory, { recursive: true });
            await writeFile(join(canonicalDirectory, "SKILL.md"), "# Alpha Canonical\n");
            await writeFile(
                resolveManagedSkillMetadataFilePath(canonicalDirectory),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                })),
            );
            await mkdir(hostDirectory, { recursive: true });
            await writeFile(join(hostDirectory, "SKILL.md"), "tampered\n");
            await writeFile(
                resolveManagedSkillMetadataFilePath(hostDirectory),
                renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                })),
            );

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "alpha-skill",
                "--agent",
                "universal",
            ], {
                fetcher: async () => {
                    throw new Error("repair must not perform HTTP calls");
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const hostSkillMd = await readFile(join(hostDirectory, "SKILL.md"), "utf8");

            expect(hostSkillMd).toBe("# Alpha Canonical\n");
            const hostMetadata = await readFile(
                resolveManagedSkillMetadataFilePath(hostDirectory),
                "utf8",
            );

            expect(hostMetadata).toContain("\"packageName\": \"@oomol/alpha\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json default omits schemaVersion, --show-schema-version prepends it", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });

            const resultDefault = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });
            const resultWithSchema = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--show-schema-version",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(resultDefault.exitCode).toBe(0);
            const defaultPayload = JSON.parse(resultDefault.stdout) as Record<string, unknown>;

            expect(defaultPayload).not.toHaveProperty("schemaVersion");
            expect(defaultPayload).toHaveProperty("summary");
            expect(defaultPayload).toHaveProperty("results");

            expect(resultWithSchema.exitCode).toBe(0);
            const schemaPayload = JSON.parse(resultWithSchema.stdout) as Record<string, unknown>;

            expect(schemaPayload.schemaVersion).toBe("1.0.0");
            expect(schemaPayload).toHaveProperty("summary");
            expect(schemaPayload).toHaveProperty("results");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("JSON success result includes skill, kind, agentId, status, path, sourcePath, version", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });

            const result = await sandbox.run([
                "skills",
                "repair",
                "--json",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const results = payload.results as Array<Record<string, unknown>>;

            expect(results).toHaveLength(1);
            const entry = results[0]!;

            expect(entry).toMatchObject({
                skill: "oo",
                kind: "bundled",
                agentId: "universal",
                status: "repaired",
                version: TEST_CLI_VERSION,
            });
            expect(entry.path).toBeTypeOf("string");
            expect(entry.sourcePath).toBeTypeOf("string");
            expect(entry.error).toBeUndefined();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text output never includes filesystem paths or sourcePath", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const ooSkillDirectory = resolveManagedSkillDirectoryPath(universalHomeDirectory, "oo");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "oo",
                "--agent",
                "universal",
            ], { version: TEST_CLI_VERSION });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain(universalHomeDirectory);
            expect(result.stdout).not.toContain(ooSkillDirectory);
            expect(result.stdout).not.toMatch(/sourcePath/i);
            expect(result.stdout).not.toMatch(/^\s*Path:/m);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("repair omits success summary when every pair fails", async () => {
        const sandbox = await createCliSandbox();
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });
            await mkdir(universalHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "repair",
                "--skill",
                "nonexistent",
                "--agent",
                "claude",
                "--agent",
                "universal",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).not.toMatch(/^Repaired /m);
            expect(result.stdout).toMatch(/^Failed to repair 2 /m);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // The success summary must reflect only agents that actually had a skill
    // repaired, not the total number of targeted agents. chmod is unreliable
    // on Windows and a no-op for root on Unix, so the test is scoped to a
    // non-root POSIX environment.
    const isUnixNonRoot = process.platform !== "win32" && process.getuid?.() !== 0;
    const partialFailureTest = isUnixNonRoot ? test : test.skip;

    partialFailureTest(
        "repair success summary counts only agents that had a repair succeed",
        async () => {
            const sandbox = await createCliSandbox();
            const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
            const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
            const claudeOoDirectory = resolveManagedSkillDirectoryPath(claudeHomeDirectory, "oo");
            const universalSkillsDirectory = join(universalHomeDirectory, "skills");

            try {
                await mkdir(claudeHomeDirectory, { recursive: true });
                await mkdir(universalHomeDirectory, { recursive: true });
                await sandbox.run(["skills", "install", "oo"], { version: TEST_CLI_VERSION });
                await writeFile(join(claudeOoDirectory, "SKILL.md"), "tampered\n");
                // Block writes into universal's skills root so that (oo, universal)
                // fails while (oo, claude) still succeeds.
                await chmod(universalSkillsDirectory, 0o555);

                const result = await sandbox.run([
                    "skills",
                    "repair",
                    "--skill",
                    "oo",
                    "--agent",
                    "claude",
                    "--agent",
                    "universal",
                ], { version: TEST_CLI_VERSION });

                expect(result.exitCode).toBe(1);
                expect(result.stdout).toMatch(/^Repaired 1 skill\(s\) for 1 agent\(s\)\./m);
                expect(result.stdout).not.toMatch(/for 2 agent\(s\)/);
                expect(result.stdout).toMatch(/^Failed to repair 1 /m);
            }
            finally {
                await chmod(universalSkillsDirectory, 0o755).catch(() => undefined);
                await sandbox.cleanup();
            }
        },
    );
});
