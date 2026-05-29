import type { UninstallPlan, UninstallPlanItem } from "./uninstall.ts";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveManagedSkillMetadataFilePath } from "../commands/skills/managed-skill-paths.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "../commands/skills/skill-metadata.ts";
import {
    buildSelfUninstallPlan,
    createWindowsSelfDeleteScript,
    performSelfUninstall,
    shouldRemoveManagedSkill,

} from "./uninstall.ts";

const PRESET_PACKAGE = "@alwaysmavs/gpt-image-2";

const noopLogger = {
    warn: () => {},
    info: () => {},
    debug: () => {},
    error: () => {},
} as never;

let tempHome: string;

beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "oo-uninstall-test-"));
});

afterEach(async () => {
    await Bun.$`rm -rf ${tempHome}`.quiet().nothrow();
});

function categoriesOf(items: readonly UninstallPlanItem[]): string[] {
    return items.map(item => item.category);
}

function paths(items: readonly UninstallPlanItem[]): string[] {
    return items.map(item => item.path);
}

async function writeSkill(
    skillDirectory: string,
    metadataJson: string,
): Promise<void> {
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), "# x\n");
    await writeFile(resolveManagedSkillMetadataFilePath(skillDirectory), metadataJson);
}

describe("shouldRemoveManagedSkill", () => {
    test("bundled is always removed", () => {
        expect(shouldRemoveManagedSkill(createBundledSkillMetadata("1.0.0"), { purge: false })).toBe(true);
        expect(shouldRemoveManagedSkill(createBundledSkillMetadata("1.0.0"), { purge: true })).toBe(true);
    });

    test("preset registry is removed by default", () => {
        const metadata = createRegistrySkillMetadata({ packageName: PRESET_PACKAGE, version: "0.1.0" });

        expect(shouldRemoveManagedSkill(metadata, { purge: false })).toBe(true);
    });

    test("non-preset registry is kept by default and removed under purge", () => {
        const metadata = createRegistrySkillMetadata({ packageName: "@alice/demo", version: "0.1.0" });

        expect(shouldRemoveManagedSkill(metadata, { purge: false })).toBe(false);
        expect(shouldRemoveManagedSkill(metadata, { purge: true })).toBe(true);
    });

    test("local is never removed", () => {
        expect(shouldRemoveManagedSkill(createLocalSkillMetadata(), { purge: false })).toBe(false);
        expect(shouldRemoveManagedSkill(createLocalSkillMetadata(), { purge: true })).toBe(false);
    });

    test("missing metadata is never removed", () => {
        expect(shouldRemoveManagedSkill(undefined, { purge: false })).toBe(false);
        expect(shouldRemoveManagedSkill(undefined, { purge: true })).toBe(false);
    });
});

describe("createWindowsSelfDeleteScript", () => {
    test("waits for the parent pid then removes literal paths and itself", () => {
        const script = createWindowsSelfDeleteScript({
            deferredPaths: ["C:\\Users\\a b\\.local\\bin\\oo.exe"],
            processId: 4321,
        });

        expect(script).toContain("Wait-Process -Id 4321");
        expect(script).toContain(
            "Remove-Item -LiteralPath 'C:\\Users\\a b\\.local\\bin\\oo.exe' -Force -Recurse -ErrorAction SilentlyContinue",
        );
        expect(script).toContain("Remove-Item -LiteralPath $PSCommandPath");
    });

    test("escapes single quotes in paths", () => {
        const script = createWindowsSelfDeleteScript({
            deferredPaths: ["C:\\o'o\\oo.exe"],
            processId: 1,
        });

        expect(script).toContain("'C:\\o''o\\oo.exe'");
    });
});

describe("buildSelfUninstallPlan", () => {
    function nativeOptions(overrides: { platform?: NodeJS.Platform; purge?: boolean } = {}) {
        const platform = overrides.platform ?? "linux";
        const executableName = platform === "win32" ? "oo.exe" : "oo";

        return {
            env: { HOME: tempHome },
            execPath: join(tempHome, ".local", "bin", executableName),
            homeDirectory: tempHome,
            platform,
            purge: overrides.purge ?? false,
            version: "1.2.3",
        };
    }

    test("native linux default plan removes runtime synchronously, no user data", async () => {
        const plan = await buildSelfUninstallPlan(nativeOptions());

        expect(plan.installationMethod).toBe("native");
        expect(plan.deferred).toEqual([]);
        expect(categoriesOf(plan.immediate)).toContain("binary");
        expect(categoriesOf(plan.immediate)).toContain("versions");
        expect(categoriesOf(plan.immediate)).toContain("staging");
        expect(categoriesOf(plan.immediate)).toContain("locks");
        expect(categoriesOf(plan.immediate)).not.toContain("user-data");
    });

    test("native win32 defers the running executable only", async () => {
        const plan = await buildSelfUninstallPlan(nativeOptions({ platform: "win32" }));

        expect(categoriesOf(plan.deferred)).toEqual(["binary"]);
        // versions/staging/locks are standalone copies, still removed in-process
        expect(categoriesOf(plan.immediate)).toContain("versions");
        expect(categoriesOf(plan.immediate)).not.toContain("binary");
    });

    test("--purge adds user-data targets", async () => {
        const plan = await buildSelfUninstallPlan(nativeOptions({ purge: true }));
        const userData = plan.immediate.filter(item => item.category === "user-data");

        expect(userData.length).toBeGreaterThanOrEqual(4);
        expect(paths(userData).some(path => path.endsWith("auth.toml"))).toBe(true);
        expect(paths(userData).some(path => path.endsWith("settings.toml"))).toBe(true);
    });

    test("classifies skills by metadata: bundled+preset removed, registry kept, local/unmanaged retained", async () => {
        const codexSkillsDir = join(tempHome, ".codex", "skills");

        await mkdir(join(tempHome, ".codex"), { recursive: true });
        await writeSkill(
            join(codexSkillsDir, "oo"),
            renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
        );
        await writeSkill(
            join(codexSkillsDir, "gpt-image-2"),
            renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: PRESET_PACKAGE, version: "0.1.0" })),
        );
        await writeSkill(
            join(codexSkillsDir, "demo"),
            renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "@alice/demo", version: "0.2.0" })),
        );
        await writeSkill(
            join(codexSkillsDir, "mine"),
            renderSkillMetadataJson(createLocalSkillMetadata()),
        );
        // unmanaged same-name dir: no metadata file
        await mkdir(join(codexSkillsDir, "handwritten"), { recursive: true });
        await writeFile(join(codexSkillsDir, "handwritten", "SKILL.md"), "# user\n");

        const plan = await buildSelfUninstallPlan(nativeOptions());
        const removedPaths = paths(plan.immediate.filter(
            item => item.category === "bundled-skill" || item.category === "registry-skill",
        ));

        expect(removedPaths.some(path => path.endsWith(join(".codex", "skills", "oo")))).toBe(true);
        expect(removedPaths.some(path => path.endsWith(join(".codex", "skills", "gpt-image-2")))).toBe(true);
        expect(removedPaths.some(path => path.endsWith(join(".codex", "skills", "demo")))).toBe(false);
        expect(removedPaths.some(path => path.endsWith(join(".codex", "skills", "mine")))).toBe(false);
        // unmanaged dir never appears in any removal set
        expect(paths(plan.immediate).some(path => path.endsWith("handwritten"))).toBe(false);

        const retainedReasons = plan.retainedSkills.map(skill => skill.reason);

        expect(retainedReasons).toContain("registry");
        expect(retainedReasons).toContain("local");
    });

    test("--purge removes all registry skills", async () => {
        const codexSkillsDir = join(tempHome, ".codex", "skills");

        await mkdir(join(tempHome, ".codex"), { recursive: true });
        await writeSkill(
            join(codexSkillsDir, "demo"),
            renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "@alice/demo", version: "0.2.0" })),
        );

        const plan = await buildSelfUninstallPlan(nativeOptions({ purge: true }));
        const removedPaths = paths(plan.immediate.filter(item => item.category === "registry-skill"));

        expect(removedPaths.some(path => path.endsWith(join(".codex", "skills", "demo")))).toBe(true);
    });

    test("npm install: no runtime items, skills still classified", async () => {
        const plan = await buildSelfUninstallPlan({
            env: { HOME: tempHome },
            execPath: join(tempHome, "node_modules", "@oomol-lab", "oo-cli", "bin", "oo.js"),
            homeDirectory: tempHome,
            platform: "linux",
            purge: false,
            version: "1.2.3",
        });

        expect(plan.installationMethod).toBe("npm");
        expect(categoriesOf(plan.immediate)).not.toContain("binary");
        expect(categoriesOf(plan.immediate)).not.toContain("versions");
    });
});

describe("performSelfUninstall", () => {
    test("unix removes immediate and deferred in-process", async () => {
        const binaryPath = join(tempHome, "bin", "oo");
        const versionsPath = join(tempHome, "versions");

        await mkdir(join(tempHome, "bin"), { recursive: true });
        await writeFile(binaryPath, "binary");
        await mkdir(versionsPath, { recursive: true });

        const plan: UninstallPlan = {
            deferred: [],
            immediate: [
                { category: "binary", label: "x", path: binaryPath },
                { category: "versions", label: "x", path: versionsPath },
            ],
            installationMethod: "native",
            platform: "linux",
            purge: false,
            retainedSkills: [],
        };

        const result = await performSelfUninstall({
            logger: noopLogger,
            plan,
            processId: 999_999,
            timestamp: 1,
        });

        expect(result.status).toBe("completed");
        expect((result as { deferredToHelper: boolean }).deferredToHelper).toBe(false);
        expect(await Bun.file(binaryPath).exists()).toBe(false);
    });

    test("windows defers binary to spawned helper", async () => {
        const stagingPath = join(tempHome, "staging");
        const stagingMarker = join(stagingPath, "marker");
        const helperDirectory = join(tempHome, "uninstall-helper");
        const binaryPath = join(tempHome, "bin", "oo.exe");

        await mkdir(stagingPath, { recursive: true });
        await writeFile(stagingMarker, "x");
        await mkdir(join(tempHome, "bin"), { recursive: true });
        await writeFile(binaryPath, "binary");

        const plan: UninstallPlan = {
            deferred: [
                { category: "binary", label: "x", path: binaryPath },
            ],
            helperDirectory,
            immediate: [
                { category: "staging", label: "x", path: stagingPath },
            ],
            installationMethod: "native",
            platform: "win32",
            purge: false,
            retainedSkills: [],
        };
        const spawnedCommands: string[][] = [];

        const result = await performSelfUninstall({
            logger: noopLogger,
            plan,
            processId: 4242,
            spawnDetached: command => spawnedCommands.push([...command]),
            timestamp: 7,
        });

        expect(result.status).toBe("completed");
        expect((result as { deferredToHelper: boolean }).deferredToHelper).toBe(true);
        expect(spawnedCommands).toHaveLength(1);
        expect(spawnedCommands[0]![0]).toBe("powershell");
        // The running binary is NOT removed in-process; the helper handles it.
        expect(await Bun.file(binaryPath).exists()).toBe(true);
        // staging was removed in-process
        expect(await Bun.file(stagingMarker).exists()).toBe(false);
        // helper is written to its dedicated directory, not into a removed path
        expect(spawnedCommands[0]!.at(-1)!.startsWith(helperDirectory)).toBe(true);
    });

    test("windows spawn failure aborts before destructive removal (P0)", async () => {
        const stagingPath = join(tempHome, "staging");
        const stagingMarker = join(stagingPath, "marker");
        const binaryPath = join(tempHome, "bin", "oo.exe");

        await mkdir(stagingPath, { recursive: true });
        await writeFile(stagingMarker, "x");
        await mkdir(join(tempHome, "bin"), { recursive: true });
        await writeFile(binaryPath, "binary");

        const plan: UninstallPlan = {
            deferred: [
                { category: "binary", label: "x", path: binaryPath },
            ],
            helperDirectory: join(tempHome, "uninstall-helper"),
            immediate: [
                { category: "staging", label: "x", path: stagingPath },
            ],
            installationMethod: "native",
            platform: "win32",
            purge: false,
            retainedSkills: [],
        };

        await expect(performSelfUninstall({
            logger: noopLogger,
            plan,
            processId: 1,
            spawnDetached: () => {
                throw new Error("spawn failed");
            },
            timestamp: 1,
        })).rejects.toThrow();

        // Nothing destructive happened: immediate items remain.
        expect(await Bun.file(stagingMarker).exists()).toBe(true);
        expect(await Bun.file(binaryPath).exists()).toBe(true);
    });

    test("reports failedPaths when a path cannot be removed (P1)", async () => {
        // Platform-independent removal failure: the parent is a regular file,
        // so removing `<file>/child` raises ENOTDIR (not the ENOENT that
        // `force: true` tolerates). No chmod/ACL semantics, so it behaves the
        // same on POSIX and Windows CI.
        const parentFile = join(tempHome, "not-a-directory");
        const unremovablePath = join(parentFile, "child");

        await writeFile(parentFile, "x");

        const plan: UninstallPlan = {
            deferred: [],
            immediate: [
                { category: "user-data", label: "x", path: unremovablePath },
            ],
            installationMethod: "native",
            platform: process.platform,
            purge: true,
            retainedSkills: [],
        };

        const result = await performSelfUninstall({
            logger: noopLogger,
            plan,
            processId: 999_999,
            timestamp: 1,
        });

        expect(result.status).toBe("completed");
        expect((result as { failedPaths: string[] }).failedPaths).toContain(unremovablePath);
    });
});
