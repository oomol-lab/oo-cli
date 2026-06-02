import { mkdir, rm, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { resolveBundledSkillCanonicalDirectoryPath } from "./bundled-skill-paths.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createLocalSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

const bundledSkillNames = [
    "oo",
    "oo-find-skills",
    "oo-create-skill",
    "oo-publish-skill",
] as const;

describe("skills info CLI", () => {
    test("renders the new inventory text output with controlState per host", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const alphaSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await writeFile(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "info"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "✓ Found 5 skills (bundled: 4, registry: 1, local: 0).",
            );
            for (const skillName of bundledSkillNames) {
                expect(result.stdout).toContain(skillName);
            }
            expect(result.stdout).toContain("alpha-skill");
            expect(result.stdout).toContain("  Kind: bundled");
            expect(result.stdout).toContain("  Kind: registry");
            expect(result.stdout).toContain("  Package: <internal>");
            expect(result.stdout).toContain("  Package: @oomol/alpha");
            expect(result.stdout).toContain("  Version: 9.9.9");
            expect(result.stdout).toContain("  Version: 1.2.3");
            expect(result.stdout).toContain("  Hosts:");
            expect(result.stdout).toMatch(/Universal\s+installed\s+\S*controlled/);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text output never contains absolute paths or sourcePath", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const alphaSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await writeFile(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "info"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain(universalHomeDirectory);
            expect(result.stdout).not.toContain(alphaSkillDirectoryPath);
            expect(result.stdout).not.toMatch(/Path:/);
            expect(result.stdout).not.toMatch(/source:/);
            expect(result.stdout).not.toMatch(/sourcePath/);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("local skill text output omits paths", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const localSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "campaign-writer",
        );

        try {
            await writeLocalSkillDirectory(localSkillDirectoryPath, "campaign-writer");

            const result = await sandbox.run([
                "skills",
                "info",
                "--source",
                "local",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("campaign-writer");
            expect(result.stdout).toContain("  Kind: local");
            expect(result.stdout).toContain("  Package: <local>");
            expect(result.stdout).toContain("  Hosts:");
            expect(result.stdout).not.toContain(localSkillDirectoryPath);
            expect(result.stdout).not.toMatch(/Path:/);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("default view excludes local skills; --source local includes them", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const localSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "campaign-writer",
        );

        try {
            await writeLocalSkillDirectory(localSkillDirectoryPath, "campaign-writer");

            const defaultResult = await sandbox.run(["skills", "info"]);
            const localResult = await sandbox.run(["skills", "info", "--source", "local"]);

            expect(defaultResult.exitCode).toBe(0);
            expect(defaultResult.stdout).not.toContain("campaign-writer");
            expect(localResult.exitCode).toBe(0);
            expect(localResult.stdout).toContain("campaign-writer");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("exposes the same listing under both info and list command names", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const alphaSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await writeFile(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const infoResult = await sandbox.run(["skills", "info"], { version: "9.9.9" });
            const listResult = await sandbox.run(["skills", "list"], { version: "9.9.9" });

            expect(infoResult.exitCode).toBe(0);
            expect(infoResult.stdout).toBe(listResult.stdout);
            expect(infoResult.stdout).toContain("alpha-skill");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records info telemetry when invoked through the list alias", async () => {
        const sandbox = await createCliSandbox();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });

        try {
            const result = await sandbox.run(["skills", "list"]);

            expect(result.exitCode).toBe(0);
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "skills.info",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--source registry filter still reports full summary counts", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const alphaSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );
        const localSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "campaign-writer",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await writeFile(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );
            await writeLocalSkillDirectory(localSkillDirectoryPath, "campaign-writer");

            const result = await sandbox.run([
                "skills",
                "info",
                "--source",
                "registry",
            ], { version: "9.9.9" });

            expect(result.exitCode).toBe(0);
            // Summary reports the full inventory regardless of filter.
            expect(result.stdout).toContain(
                "Found 1 skills (bundled: 4, registry: 1, local: 1)",
            );
            expect(result.stdout).toContain("alpha-skill");
            expect(result.stdout).not.toContain("campaign-writer");
            // Bundled skill names should be filtered out.
            for (const bundledName of bundledSkillNames) {
                expect(result.stdout).not.toMatch(new RegExp(`^${bundledName}$`, "m"));
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--agent filter scopes hosts but summary still reflects full inventory", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await mkdir(claudeHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });

            const result = await sandbox.run([
                "skills",
                "info",
                "--agent",
                "universal",
            ], { version: "9.9.9" });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Found 4 skills (bundled: 4, registry: 0, local: 0)",
            );
            expect(result.stdout).toContain("Universal");
            expect(result.stdout).not.toContain("Claude Code");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the source filter", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "info", "--source", "unknown"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Invalid source: unknown. Use bundled, registry, or local.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a no-results message when the filtered view is empty", async () => {
        const sandbox = await createCliSandbox();

        try {
            // The universal host is always provisioned, so bundled skills are
            // always present in the inventory. Filtering to local (with no local
            // skills authored) yields an empty filtered view and surfaces the
            // no-results message.
            const result = await sandbox.run(["skills", "info", "--source", "local"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("! No skills were found.\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json emits structured payload without schemaVersion by default", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const alphaSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await writeFile(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).not.toHaveProperty("schemaVersion");
            expect(payload).toHaveProperty("summary");
            expect(payload.summary).toEqual({
                bundledSkills: 4,
                registrySkills: 1,
                localSkills: 0,
            });
            expect(Array.isArray(payload.skills)).toBe(true);
            const skills = payload.skills as Array<Record<string, unknown>>;
            const registryEntry = skills.find(skill => skill.id === "alpha-skill");

            expect(registryEntry).toBeDefined();
            expect(registryEntry).toMatchObject({
                id: "alpha-skill",
                name: "alpha-skill",
                kind: "registry",
                packageName: "@oomol/alpha",
                version: "1.2.3",
            });
            expect(Array.isArray(registryEntry?.hosts)).toBe(true);
            const hosts = registryEntry?.hosts as Array<Record<string, unknown>>;
            const universalHost = hosts.find(host => host.agentId === "universal");

            expect(universalHost).toMatchObject({
                agentId: "universal",
                status: "installed",
                version: "1.2.3",
            });
            expect(universalHost?.path).toBe(alphaSkillDirectoryPath);
            expect(universalHost?.sourcePath).toBeTypeOf("string");
            // controlState is "unknown" here since the canonical registry
            // source was never created by this lightweight test; other tests
            // cover the controlled/modified/non-managed branches explicitly.
            expect(["controlled", "modified", "unknown"]).toContain(
                universalHost?.controlState as string,
            );
            const ooEntry = skills.find(skill => skill.id === "oo");

            expect(ooEntry?.kind).toBe("bundled");
            expect(ooEntry?.packageName).toBeNull();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });

            const result = await sandbox.run([
                "skills",
                "info",
                "--json",
                "--show-schema-version",
            ], { version: "9.9.9" });

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

    test("--json modified host content surfaces controlState=modified", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: "9.9.9" });
            // Mutate the host installation to diverge from canonical source.
            const skillMdPath = join(universalHomeDirectory, "skills", "oo", "SKILL.md");

            await writeFile(skillMdPath, "modified content\n");

            const result = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooEntry = skills.find(skill => skill.id === "oo");
            const hosts = ooEntry?.hosts as Array<Record<string, unknown>>;
            const universalHost = hosts.find(host => host.agentId === "universal");

            expect(universalHost?.controlState).toBe("modified");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json host directory without .oo-metadata.json surfaces controlState=non-managed", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const claudeOoSkillDirectory = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            "oo",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: "9.9.9" });
            // Create a same-name directory on Claude without .oo-metadata.json.
            await mkdir(claudeOoSkillDirectory, { recursive: true });
            await writeFile(join(claudeOoSkillDirectory, "SKILL.md"), "user content\n");

            const result = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooEntry = skills.find(skill => skill.id === "oo");
            const hosts = ooEntry?.hosts as Array<Record<string, unknown>>;
            const claudeHost = hosts.find(host => host.agentId === "claude");

            expect(claudeHost?.controlState).toBe("non-managed");
            expect(claudeHost?.sourcePath).toBeNull();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json invalid metadata on host scanned before managed install still surfaces as unknown", async () => {
        const sandbox = await createCliSandbox();
        // Universal is scanned before claude in supportedSkillAgents order.
        // Place invalid metadata on universal and the managed install on claude
        // to exercise the second-pass shadow attach.
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(
            sandbox.env,
            "universal",
        );
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalOoSkillDirectory = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "oo",
        );

        try {
            await mkdir(claudeHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: "9.9.9" });
            await mkdir(universalOoSkillDirectory, { recursive: true });
            await writeFile(
                resolveManagedSkillMetadataFilePath(universalOoSkillDirectory),
                "not valid json{{",
            );

            const result = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooEntry = skills.find(skill => skill.id === "oo");
            const hosts = ooEntry?.hosts as Array<Record<string, unknown>>;
            const universalHost = hosts.find(host => host.agentId === "universal");
            const claudeHost = hosts.find(host => host.agentId === "claude");

            expect(universalHost).toBeDefined();
            expect(universalHost?.controlState).toBe("unknown");
            expect(claudeHost?.controlState).toBe("controlled");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json invalid .oo-metadata.json surfaces controlState=unknown", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const claudeOoSkillDirectory = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            "oo",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: "9.9.9" });
            // Create a same-name directory on Claude with broken metadata.
            await mkdir(claudeOoSkillDirectory, { recursive: true });
            await writeFile(
                resolveManagedSkillMetadataFilePath(claudeOoSkillDirectory),
                "not valid json{{",
            );

            const result = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooEntry = skills.find(skill => skill.id === "oo");
            const hosts = ooEntry?.hosts as Array<Record<string, unknown>>;
            const claudeHost = hosts.find(host => host.agentId === "claude");

            expect(claudeHost?.controlState).toBe("unknown");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json missing canonical source surfaces controlState=unknown", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install", "oo"], { version: "9.9.9" });
            // Wipe the canonical bundled source so the host install has no
            // counterpart to compare against.
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

            await rm(canonicalDirectory, { recursive: true, force: true });

            const result = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const ooEntry = skills.find(skill => skill.id === "oo");
            const hosts = ooEntry?.hosts as Array<Record<string, unknown>>;
            const universalHost = hosts.find(host => host.agentId === "universal");

            expect(universalHost?.controlState).toBe("unknown");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json local skill exposes sourcePath=null and controlState=controlled", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const localSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "campaign-writer",
        );

        try {
            await writeLocalSkillDirectory(localSkillDirectoryPath, "campaign-writer");

            const result = await sandbox.run(["skills", "info", "--json", "--source", "local"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const entry = skills.find(skill => skill.id === "campaign-writer");

            expect(entry).toMatchObject({
                kind: "local",
                packageName: null,
                version: null,
            });
            const hosts = entry?.hosts as Array<Record<string, unknown>>;
            const universalHost = hosts.find(host => host.agentId === "universal");

            expect(universalHost?.controlState).toBe("controlled");
            expect(universalHost?.sourcePath).toBeNull();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json multi-host different versions folds into one skill with per-host versions", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const claudeHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "claude");
        const universalAlphaSkillDirectory = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );
        const claudeAlphaSkillDirectory = resolveManagedSkillDirectoryPath(
            claudeHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(universalAlphaSkillDirectory, { recursive: true });
            await mkdir(claudeAlphaSkillDirectory, { recursive: true });
            await writeFile(
                join(universalAlphaSkillDirectory, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );
            await writeFile(
                join(claudeAlphaSkillDirectory, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.5.0",
                }),
            );

            const result = await sandbox.run(["skills", "info", "--json"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const alphaEntries = skills.filter(skill => skill.id === "alpha-skill");

            expect(alphaEntries).toHaveLength(1);
            const hosts = alphaEntries[0]?.hosts as Array<Record<string, unknown>>;
            const universalHost = hosts.find(host => host.agentId === "universal");
            const claudeHost = hosts.find(host => host.agentId === "claude");

            expect(universalHost?.version).toBe("1.2.3");
            expect(claudeHost?.version).toBe("1.5.0");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json summary unaffected by --source filter", async () => {
        const sandbox = await createCliSandbox();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");
        const alphaSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            universalHomeDirectory,
            "alpha-skill",
        );

        try {
            await mkdir(universalHomeDirectory, { recursive: true });
            await sandbox.run(["skills", "install"], { version: "9.9.9" });
            await mkdir(alphaSkillDirectoryPath, { recursive: true });
            await writeFile(
                join(alphaSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const fullResult = await sandbox.run(["skills", "info", "--json"], {
                version: "9.9.9",
            });
            const registryResult = await sandbox.run([
                "skills",
                "info",
                "--json",
                "--source",
                "registry",
            ], { version: "9.9.9" });

            const fullPayload = JSON.parse(fullResult.stdout) as Record<string, unknown>;
            const registryPayload = JSON.parse(registryResult.stdout) as Record<string, unknown>;

            expect(registryPayload.summary).toEqual(fullPayload.summary);
            const registrySkills = registryPayload.skills as Array<Record<string, unknown>>;

            expect(registrySkills.every(skill => skill.kind === "registry")).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports description from canonical SKILL.md", async () => {
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
            await mkdir(hostDirectory, { recursive: true });
            await mkdir(canonicalDirectory, { recursive: true });
            await writeFile(
                join(canonicalDirectory, "SKILL.md"),
                [
                    "---",
                    "name: alpha-skill",
                    "description: Alpha helper for orchestration tests.",
                    "---",
                    "",
                ].join("\n"),
            );
            await writeFile(
                resolveManagedSkillMetadataFilePath(canonicalDirectory),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );
            await writeFile(
                join(hostDirectory, ".oo-metadata.json"),
                renderSkillMetadataJson({
                    packageName: "@oomol/alpha",
                    version: "1.2.3",
                }),
            );

            const result = await sandbox.run(["skills", "info", "--json"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const skills = payload.skills as Array<Record<string, unknown>>;
            const entry = skills.find(skill => skill.id === "alpha-skill");

            expect(entry?.description).toBe(
                "Alpha helper for orchestration tests.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("treats the removed list-local command as unknown", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["skills", "list-local"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Unknown command: list-local.");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records filter telemetry without skill inventory", async () => {
        const sandbox = await createCliSandbox();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const skillDirectoryPath = resolveManagedSkillDirectoryPath(
            resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal"),
            "telemetry-skill",
        );

        try {
            await writeLocalSkillDirectory(skillDirectoryPath, "telemetry-skill");

            const result = await sandbox.run([
                "skills",
                "info",
                "--source",
                "local",
                "--agent",
                "universal",
            ]);

            expect(result.exitCode).toBe(0);
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(storePaths.telemetryDirectory)[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "skills.info",
                    has_agent_filter: true,
                    source_filter: "local",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("agent");
            expect(telemetryPayload?.properties).not.toHaveProperty("paths");
            expect(telemetryPayload?.properties).not.toHaveProperty("skillNames");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function writeLocalSkillDirectory(
    skillDirectoryPath: string,
    skillName: string,
): Promise<void> {
    await mkdir(skillDirectoryPath, { recursive: true });
    await writeFile(
        join(skillDirectoryPath, "SKILL.md"),
        [
            "---",
            `name: ${skillName}`,
            "description: Use a local workflow.",
            "---",
            "",
        ].join("\n"),
    );
    await writeFile(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(createLocalSkillMetadata()),
    );
}
