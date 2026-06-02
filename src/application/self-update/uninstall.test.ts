import type { UninstallPlan, UninstallPlanItem } from "./uninstall.ts";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join, win32 } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import { resolveManagedSkillMetadataFilePath } from "../commands/skills/managed-skill-paths.ts";
import { presetSkillPackageNames } from "../commands/skills/preset-packages.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "../commands/skills/skill-metadata.ts";
import { APP_NAME } from "../config/app-config.ts";
import { readPathModule } from "./paths.ts";
import {
    buildSelfUninstallPlan,
    createWindowsSelfDeleteScript,
    performSelfUninstall,
    shouldRemoveManagedSkill,
} from "./uninstall.ts";

const PRESET_PACKAGE = presetSkillPackageNames[0];

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
        const deferredPath = win32.join(
            "C:\\",
            "Users",
            "a b",
            ".local",
            "bin",
            "oo.exe",
        );
        const script = createWindowsSelfDeleteScript({
            deferredPaths: [deferredPath],
            processId: 4321,
        });

        expect(script).toContain("Wait-Process -Id 4321");
        expect(script).toContain(
            `Remove-Item -LiteralPath '${deferredPath}' -Force -Recurse -ErrorAction SilentlyContinue`,
        );
        expect(script).toContain("Remove-Item -LiteralPath $PSCommandPath");
    });

    test("escapes single quotes in paths", () => {
        const deferredPath = win32.join("C:\\", "o'o", "oo.exe");
        const script = createWindowsSelfDeleteScript({
            deferredPaths: [deferredPath],
            processId: 1,
        });

        expect(script).toContain(`'${deferredPath.replaceAll("'", "''")}'`);
    });
});

describe("buildSelfUninstallPlan", () => {
    function nativeOptions(overrides: { platform?: NodeJS.Platform; purge?: boolean } = {}) {
        const platform = overrides.platform ?? "linux";
        const executableName = platform === "win32" ? "oo.exe" : "oo";

        return {
            env: { HOME: tempHome },
            // Build the exec path with the simulated platform's separators so the
            // managed-path comparison in detectInstallationMethodFromExecPath
            // matches even when the host platform differs (e.g. simulating linux
            // on a Windows CI runner, where node:path.join would emit backslashes).
            execPath: readPathModule(platform).join(
                tempHome,
                ".local",
                "bin",
                executableName,
            ),
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

    test("win32 --purge defers the data directory but removes config files in-process", async () => {
        const plan = await buildSelfUninstallPlan(
            nativeOptions({ platform: "win32", purge: true }),
        );

        // The data directory holds open SQLite handles, so it is deferred to the
        // post-exit helper alongside the running executable.
        expect(plan.helperDirectory).toBeDefined();
        const deferredUserData = plan.deferred.filter(
            item => item.category === "user-data",
        );

        expect(paths(deferredUserData).some(path => path.endsWith("data"))).toBe(true);
        expect(plan.immediate.some(item => item.path.endsWith("data"))).toBe(false);

        // Config files are not held open and are still removed in-process.
        const immediateUserData = plan.immediate.filter(
            item => item.category === "user-data",
        );

        expect(paths(immediateUserData).some(path => path.endsWith("auth.toml"))).toBe(true);
        expect(paths(immediateUserData).some(path => path.endsWith("settings.toml"))).toBe(true);

        // The whole config root is also deferred on Windows (open SQLite under it).
        const rootDirectory = resolveStorePaths({
            appName: APP_NAME,
            env: { HOME: tempHome },
            homeDirectory: tempHome,
            platform: "win32",
        }).rootDirectory;

        expect(paths(deferredUserData)).toContain(rootDirectory);
    });

    test("--purge adds user-data targets including the config root last", async () => {
        const plan = await buildSelfUninstallPlan(nativeOptions({ purge: true }));
        const userData = plan.immediate.filter(item => item.category === "user-data");

        expect(userData.length).toBeGreaterThanOrEqual(4);
        expect(paths(userData).some(path => path.endsWith("auth.toml"))).toBe(true);
        expect(paths(userData).some(path => path.endsWith("settings.toml"))).toBe(true);

        // The config root itself is removed, and it must be the last user-data
        // item so it sweeps anything the explicit child items did not cover.
        const rootDirectory = resolveStorePaths({
            appName: APP_NAME,
            env: { HOME: tempHome },
            homeDirectory: tempHome,
            platform: "linux",
        }).rootDirectory;

        expect(paths(userData)).toContain(rootDirectory);
        expect(userData.at(-1)?.path).toBe(rootDirectory);
    });

    test("--purge config root resolves to the app-support directory on darwin", async () => {
        const plan = await buildSelfUninstallPlan(
            nativeOptions({ platform: "darwin", purge: true }),
        );
        const userData = plan.immediate.filter(item => item.category === "user-data");
        const rootItem = userData.at(-1);

        expect(rootItem?.path.endsWith(
            join("Library", "Application Support", "oo"),
        )).toBe(true);
    });

    test("non-purge plan never includes the config root", async () => {
        const plan = await buildSelfUninstallPlan(nativeOptions());

        expect(plan.immediate.every(item => item.category !== "user-data")).toBe(true);
        expect(plan.deferred.every(item => item.category !== "user-data")).toBe(true);
    });

    test("classifies skills by metadata: bundled+preset removed, registry kept, local/unmanaged retained", async () => {
        const universalSkillsDir = join(tempHome, ".agents", "skills");

        await mkdir(join(tempHome, ".agents"), { recursive: true });
        await writeSkill(
            join(universalSkillsDir, "oo"),
            renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
        );
        await writeSkill(
            join(universalSkillsDir, "gpt-image-2"),
            renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: PRESET_PACKAGE, version: "0.1.0" })),
        );
        await writeSkill(
            join(universalSkillsDir, "demo"),
            renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "@alice/demo", version: "0.2.0" })),
        );
        await writeSkill(
            join(universalSkillsDir, "mine"),
            renderSkillMetadataJson(createLocalSkillMetadata()),
        );
        // unmanaged same-name dir: no metadata file
        await mkdir(join(universalSkillsDir, "handwritten"), { recursive: true });
        await writeFile(join(universalSkillsDir, "handwritten", "SKILL.md"), "# user\n");

        const plan = await buildSelfUninstallPlan(nativeOptions());
        const removedPaths = paths(plan.immediate.filter(
            item => item.category === "bundled-skill" || item.category === "registry-skill",
        ));

        expect(removedPaths.some(path => path.endsWith(join(".agents", "skills", "oo")))).toBe(true);
        expect(removedPaths.some(path => path.endsWith(join(".agents", "skills", "gpt-image-2")))).toBe(true);
        expect(removedPaths.some(path => path.endsWith(join(".agents", "skills", "demo")))).toBe(false);
        expect(removedPaths.some(path => path.endsWith(join(".agents", "skills", "mine")))).toBe(false);
        // unmanaged dir never appears in any removal set
        expect(paths(plan.immediate).some(path => path.endsWith("handwritten"))).toBe(false);

        const retainedReasons = plan.retainedSkills.map(skill => skill.reason);

        expect(retainedReasons).toContain("registry");
        expect(retainedReasons).toContain("local");
    });

    test("--purge removes all registry skills", async () => {
        const universalSkillsDir = join(tempHome, ".agents", "skills");

        await mkdir(join(tempHome, ".agents"), { recursive: true });
        await writeSkill(
            join(universalSkillsDir, "demo"),
            renderSkillMetadataJson(createRegistrySkillMetadata({ packageName: "@alice/demo", version: "0.2.0" })),
        );

        const plan = await buildSelfUninstallPlan(nativeOptions({ purge: true }));
        const removedPaths = paths(plan.immediate.filter(item => item.category === "registry-skill"));

        expect(removedPaths.some(path => path.endsWith(join(".agents", "skills", "demo")))).toBe(true);
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
    test("checks active owners even when the plan does not remove locks", async () => {
        const locksDirectory = join(tempHome, "locks");
        const skillDirectory = join(tempHome, "skills", "oo");
        const markerPath = join(
            locksDirectory,
            "active",
            "1.2.3",
            `${process.pid}.marker.lock`,
        );

        await mkdir(skillDirectory, { recursive: true });
        await writeFile(join(skillDirectory, "SKILL.md"), "# x\n");
        await mkdir(join(locksDirectory, "active", "1.2.3"), { recursive: true });
        await writeJsonFile(markerPath, {
            acquiredAt: new Date().toISOString(),
            execPath: process.execPath,
            kind: "active",
            markerId: "marker",
            pid: process.pid,
            version: "1.2.3",
        });

        const plan: UninstallPlan = {
            activeVersionLocksDirectory: locksDirectory,
            deferred: [],
            immediate: [
                { category: "bundled-skill", label: "x", path: skillDirectory },
            ],
            installationMethod: "npm",
            platform: process.platform,
            purge: false,
            retainedSkills: [],
        };

        const result = await performSelfUninstall({
            logger: noopLogger,
            plan,
            processId: 999_999,
            timestamp: 1,
        });

        expect(result).toEqual({
            ownerPid: process.pid,
            status: "busy",
        });
        expect(await Bun.file(join(skillDirectory, "SKILL.md")).exists()).toBe(true);
    });

    test("unix removes immediate and deferred in-process", async () => {
        const binaryPath = join(tempHome, "bin", "oo");
        const versionsPath = join(tempHome, "versions");

        await mkdir(join(tempHome, "bin"), { recursive: true });
        await writeFile(binaryPath, "binary");
        await mkdir(versionsPath, { recursive: true });

        const plan: UninstallPlan = {
            activeVersionLocksDirectory: join(tempHome, "locks"),
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
            activeVersionLocksDirectory: join(tempHome, "locks"),
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
        // The helper is launched through a `cmd /c start "" /b` trampoline so it
        // breaks away from Bun's job object and survives this process exit.
        expect(spawnedCommands[0]!.slice(0, 5)).toEqual(["cmd", "/c", "start", "", "/b"]);
        expect(spawnedCommands[0]).toContain("powershell");
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
            activeVersionLocksDirectory: join(tempHome, "locks"),
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
        // A path with an embedded NUL makes fs.rm reject on every platform:
        // `force: true` only swallows missing-path errors, not the argument
        // validation an invalid path triggers. This deterministically exercises
        // the failure-tracking branch without depending on platform fs semantics
        // (POSIX raises ENOTDIR for `<file>/child`, Windows raises a tolerated
        // ENOENT instead).
        const unremovablePath = `${join(tempHome, "data")}${String.fromCharCode(0)}child`;

        const plan: UninstallPlan = {
            activeVersionLocksDirectory: join(tempHome, "locks"),
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

describe("performSelfUninstall windows helper integration", () => {
    // Exercises the REAL spawn path (no spawnDetached mock): a child Bun process
    // runs performSelfUninstall for a win32 plan and exits; the post-exit helper
    // must then unlink the deferred executable. This is the regression guard for
    // the job-object bug where a directly-spawned helper was killed on parent
    // exit and never removed the running image. Windows-only by nature.
    test.skipIf(process.platform !== "win32")(
        "spawned helper deletes the deferred executable after the parent exits",
        async () => {
            const exePath = join(tempHome, "bin", "oo.exe");
            const helperDir = join(tempHome, "uninstall-helper");
            const locksDir = join(tempHome, "locks");

            await mkdir(join(tempHome, "bin"), { recursive: true });
            await writeFile(exePath, "fake binary");

            // The driver imports the real module by absolute file URL, runs the
            // win32 plan against the fake executable, then exits so the helper
            // can take over removal.
            const moduleUrl = new URL("./uninstall.ts", import.meta.url).href;
            const driverPath = join(tempHome, "uninstall-driver.ts");

            await writeFile(driverPath, [
                `import { performSelfUninstall } from ${JSON.stringify(moduleUrl)};`,
                `const [exe, helper, locks] = process.argv.slice(2);`,
                `const noop = { warn() {}, info() {}, debug() {}, error() {} } as never;`,
                `await performSelfUninstall({`,
                `  logger: noop,`,
                `  plan: {`,
                `    activeVersionLocksDirectory: locks,`,
                `    deferred: [{ category: "binary", label: "oo", path: exe }],`,
                `    helperDirectory: helper,`,
                `    immediate: [],`,
                `    installationMethod: "native",`,
                `    platform: "win32",`,
                `    purge: false,`,
                `    retainedSkills: [],`,
                `  },`,
                `  processId: process.pid,`,
                `  timestamp: Date.now(),`,
                `});`,
                ``,
            ].join("\n"));

            const driver = Bun.spawn({
                cmd: [process.execPath, driverPath, exePath, helperDir, locksDir],
                stderr: "ignore",
                stdin: "ignore",
                stdout: "ignore",
            });

            await driver.exited;

            // The breakaway helper waits for the driver pid to exit, then unlinks
            // the executable. Poll until it disappears.
            expect(await waitForMissing(exePath, 20_000)).toBe(true);
        },
        30_000,
    );
});

async function writeJsonFile(path: string, value: object): Promise<void> {
    await writeFile(path, `${JSON.stringify(value)}\n`);
}

async function waitForMissing(path: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (!(await Bun.file(path).exists())) {
            return true;
        }

        await Bun.sleep(100);
    }

    return !(await Bun.file(path).exists());
}
