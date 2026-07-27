import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../../__tests__/helpers.ts";
import {
    groupInstalledSkillsByPackageName,
    installedRegistrySkillNamesForPackage,
    readInstalledSkills,
} from "./installed-skills.ts";
import { resolveManagedSkillAgentHomeDirectory } from "./managed-skill-agents.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

const cleanup = useTemporaryDirectoryCleanup();

describe("readInstalledSkills", () => {
    test("merges canonical and host copies of one registry skill into a single row", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedCanonical("demo", registryMetadata("@scope/demo", "1.0.0"));
        await sandbox.seedHost("universal", "demo", registryMetadata("@scope/demo", "1.0.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills).toEqual([
            {
                agents: [
                    {
                        agentName: "universal",
                        path: sandbox.hostSkillPath("universal", "demo"),
                        state: "managed",
                        version: "1.0.0",
                    },
                ],
                canonical: {
                    path: sandbox.canonicalSkillPath("demo"),
                    version: "1.0.0",
                },
                kind: "registry",
                name: "demo",
                packageName: "@scope/demo",
                version: "1.0.0",
            },
        ]);
    });
    test.each([
        ["host copy is newer", "1.0.0", "1.2.0", "1.2.0"],
        ["canonical copy is newer", "2.0.0", "1.9.9", "2.0.0"],
        ["prerelease loses to the release", "1.0.0", "1.0.0-rc.1", "1.0.0"],
        ["incomparable versions keep the canonical copy", "not-semver", "1.0.0", "not-semver"],
    ])(
        "reports the installed version when copies diverge (%s)",
        async (_label, canonicalVersion, hostVersion, expectedVersion) => {
            const sandbox = await createInventorySandbox();

            await sandbox.seedCanonical("demo", registryMetadata("@scope/demo", canonicalVersion));
            await sandbox.seedHost("universal", "demo", registryMetadata("@scope/demo", hostVersion));

            const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

            expect(skills).toHaveLength(1);
            expect(skills[0]?.version).toBe(expectedVersion);
        },
    );

    test("keeps the earlier agent's version when host copies tie", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "demo", registryMetadata("@scope/demo", "1.0.0+one"));
        await sandbox.seedHost("claude", "demo", registryMetadata("@scope/demo", "1.0.0+two"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills).toHaveLength(1);
        expect(skills[0]?.version).toBe("1.0.0+one");
        expect(skills[0]?.agents.map(agent => agent.agentName)).toEqual([
            "universal",
            "claude",
        ]);
    });
    test("keeps same-name skills from different packages as separate rows", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "demo", registryMetadata("@scope/one", "1.0.0"));
        await sandbox.seedHost("claude", "demo", registryMetadata("@scope/two", "2.0.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => [skill.packageName, skill.version])).toEqual([
            ["@scope/one", "1.0.0"],
            ["@scope/two", "2.0.0"],
        ]);
    });

    test("a same-name bundled host copy never shadows a canonical registry skill", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedCanonical("demo", registryMetadata("@scope/demo", "1.0.0"));
        await sandbox.seedHost("universal", "demo", bundledMetadata("0.1.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => [skill.kind, skill.name, skill.version])).toEqual([
            ["bundled", "demo", "0.1.0"],
            ["registry", "demo", "1.0.0"],
        ]);
    });

    test("reports a canonical-only registry skill with no agent copies", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedCanonical("demo", registryMetadata("@scope/demo", "1.0.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills).toEqual([
            {
                agents: [],
                canonical: {
                    path: sandbox.canonicalSkillPath("demo"),
                    version: "1.0.0",
                },
                kind: "registry",
                name: "demo",
                packageName: "@scope/demo",
                version: "1.0.0",
            },
        ]);
    });

    test("attaches metadata-less and unparseable copies to the same-name installed row", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "demo", registryMetadata("@scope/demo", "1.0.0"));
        await sandbox.seedHost("claude", "demo", undefined);
        await sandbox.seedHost("claude", "broken", "{");
        await sandbox.seedHost("universal", "broken", registryMetadata("@scope/broken", "1.0.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => [
            skill.name,
            skill.agents.map(agent => [agent.agentName, agent.state, agent.version]),
        ])).toEqual([
            ["broken", [
                ["universal", "managed", "1.0.0"],
                ["claude", "unparseable", undefined],
            ]],
            ["demo", [
                ["universal", "managed", "1.0.0"],
                ["claude", "unmanaged", undefined],
            ]],
        ]);
    });

    test("drops copies that shadow nothing installed on a host", async () => {
        const sandbox = await createInventorySandbox();

        // A canonical-only row has no managed host copy, so the shadowing
        // directory stays invisible, matching `oo skills list` behavior.
        await sandbox.seedCanonical("demo", registryMetadata("@scope/demo", "1.0.0"));
        await sandbox.seedHost("claude", "demo", undefined);
        await sandbox.seedHost("claude", "stray", undefined);

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => [skill.name, skill.agents])).toEqual([
            ["demo", []],
        ]);
    });
    test("orders rows bundled-first in embedded order, then registry, then local by name", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "zeta", registryMetadata("@scope/zeta", "1.0.0"));
        await sandbox.seedHost("universal", "alpha", registryMetadata("@scope/alpha", "1.0.0"));
        await sandbox.seedHost("universal", "oo-find-skills", bundledMetadata("0.1.0"));
        await sandbox.seedHost("universal", "oo", bundledMetadata("0.1.0"));
        await sandbox.seedHost("universal", "custom", localMetadata());

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => [skill.kind, skill.name, skill.version])).toEqual([
            ["bundled", "oo", "0.1.0"],
            ["bundled", "oo-find-skills", "0.1.0"],
            ["registry", "alpha", "1.0.0"],
            ["registry", "zeta", "1.0.0"],
            ["local", "custom", undefined],
        ]);
    });

    test("parses legacy metadata without a schema version", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "old-registry", `${JSON.stringify({
            packageName: "@scope/old",
            version: "0.9.0",
        })}\n`);
        await sandbox.seedHost("universal", "old-bundled", `${JSON.stringify({
            version: "0.2.0",
        })}\n`);

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => [skill.kind, skill.name, skill.packageName, skill.version]))
            .toEqual([
                ["bundled", "old-bundled", undefined, "0.2.0"],
                ["registry", "old-registry", "@scope/old", "0.9.0"],
            ]);
    });

    test("ignores non-registry entries under the canonical registry root", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedCanonical("stray-bundled", bundledMetadata("0.1.0"));
        await sandbox.seedCanonical("stray-broken", "{");
        await sandbox.seedCanonical("demo", registryMetadata("@scope/demo", "1.0.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(skills.map(skill => skill.name)).toEqual(["demo"]);
    });

    test("returns an empty inventory when nothing is installed", async () => {
        const sandbox = await createInventorySandbox();

        expect(await readInstalledSkills(sandbox.env, sandbox.settingsFilePath)).toEqual([]);
    });
});

describe("groupInstalledSkillsByPackageName", () => {
    test("groups registry rows by package and skips other kinds", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "beta", registryMetadata("@scope/pack", "1.0.0"));
        await sandbox.seedHost("universal", "alpha", registryMetadata("@scope/pack", "1.0.0"));
        await sandbox.seedHost("universal", "other", registryMetadata("@scope/other", "2.0.0"));
        await sandbox.seedHost("universal", "oo", bundledMetadata("0.1.0"));
        await sandbox.seedHost("universal", "custom", localMetadata());

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);
        const groups = groupInstalledSkillsByPackageName(skills);

        expect(Array.from(groups.entries()).map(([packageName, rows]) => [
            packageName,
            rows.map(row => row.name),
        ])).toEqual([
            ["@scope/pack", ["alpha", "beta"]],
            ["@scope/other", ["other"]],
        ]);
    });
});

describe("installedRegistrySkillNamesForPackage", () => {
    test("returns the sorted names recorded for the requested package only", async () => {
        const sandbox = await createInventorySandbox();

        await sandbox.seedHost("universal", "zeta", registryMetadata("@scope/pack", "1.0.0"));
        await sandbox.seedCanonical("alpha", registryMetadata("@scope/pack", "1.0.0"));
        await sandbox.seedHost("universal", "same-name", registryMetadata("@scope/other", "1.0.0"));

        const skills = await readInstalledSkills(sandbox.env, sandbox.settingsFilePath);

        expect(installedRegistrySkillNamesForPackage(skills, "@scope/pack"))
            .toEqual(["alpha", "zeta"]);
        expect(installedRegistrySkillNamesForPackage(skills, "@scope/none")).toEqual([]);
    });
});

interface InventorySandbox {
    env: Record<string, string | undefined>;
    settingsFilePath: string;
    canonicalSkillPath: (skillName: string) => string;
    hostSkillPath: (agentName: "universal" | "claude", skillName: string) => string;
    seedCanonical: (skillName: string, metadataContent: string) => Promise<void>;
    seedHost: (
        agentName: "universal" | "claude",
        skillName: string,
        metadataContent: string | undefined,
    ) => Promise<void>;
}

function registryMetadata(packageName: string, version: string): string {
    return renderSkillMetadataJson(createRegistrySkillMetadata({
        packageName,
        version,
    }));
}

function bundledMetadata(version: string): string {
    return renderSkillMetadataJson(createBundledSkillMetadata(version));
}

function localMetadata(): string {
    return renderSkillMetadataJson(createLocalSkillMetadata());
}

async function createInventorySandbox(): Promise<InventorySandbox> {
    const root = await createTemporaryDirectory("installed-skills");

    cleanup.track(root);

    const homeDirectory = join(root, "home");
    const env: Record<string, string | undefined> = {
        HOME: homeDirectory,
        USERPROFILE: homeDirectory,
    };
    const settingsFilePath = join(root, "config", "settings.json");

    await mkdir(homeDirectory, { recursive: true });

    const hostSkillPath = (
        agentName: "universal" | "claude",
        skillName: string,
    ): string => resolveManagedSkillDirectoryPath(
        resolveManagedSkillAgentHomeDirectory(env, agentName),
        skillName,
    );

    return {
        env,
        settingsFilePath,
        canonicalSkillPath: skillName =>
            resolveManagedSkillCanonicalDirectoryPath(settingsFilePath, skillName),
        hostSkillPath,
        seedCanonical: async (skillName, metadataContent) => {
            const skillDirectory = resolveManagedSkillCanonicalDirectoryPath(
                settingsFilePath,
                skillName,
            );

            await mkdir(skillDirectory, { recursive: true });
            await writeFile(join(skillDirectory, "SKILL.md"), "# Demo\n");
            await writeFile(
                resolveManagedSkillMetadataFilePath(skillDirectory),
                metadataContent,
            );
        },
        seedHost: async (agentName, skillName, metadataContent) => {
            const skillDirectory = hostSkillPath(agentName, skillName);

            await mkdir(skillDirectory, { recursive: true });
            await writeFile(join(skillDirectory, "SKILL.md"), "# Demo\n");

            if (metadataContent !== undefined) {
                await writeFile(
                    resolveManagedSkillMetadataFilePath(skillDirectory),
                    metadataContent,
                );
            }
        },
    };
}
