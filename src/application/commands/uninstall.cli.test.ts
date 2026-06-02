import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import { APP_NAME } from "../config/app-config.ts";
import { resolveSelfUpdatePaths } from "../self-update/paths.ts";
import { pathExists } from "../shared/fs-utils.ts";
import { resolveManagedSkillMetadataFilePath } from "./skills/managed-skill-paths.ts";
import { presetSkillPackageNames } from "./skills/preset-packages.ts";
import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skills/skill-metadata.ts";

const PRESET_PACKAGE = presetSkillPackageNames[0];

function selfUpdatePaths(sandbox: Awaited<ReturnType<typeof createCliSandbox>>) {
    return resolveSelfUpdatePaths({
        env: sandbox.env,
        platform: process.platform,
    });
}

function storePaths(sandbox: Awaited<ReturnType<typeof createCliSandbox>>) {
    return resolveStorePaths({
        appName: APP_NAME,
        env: sandbox.env,
        platform: process.platform,
    });
}

async function seedRuntime(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
): Promise<{ executablePath: string; versionsDirectory: string }> {
    const paths = selfUpdatePaths(sandbox);

    await mkdir(join(paths.executablePath, ".."), { recursive: true });
    await writeFile(paths.executablePath, "binary");
    await mkdir(join(paths.versionsDirectory, "1.2.3"), { recursive: true });
    await writeFile(join(paths.versionsDirectory, "1.2.3", "oo"), "binary");

    return {
        executablePath: paths.executablePath,
        versionsDirectory: paths.versionsDirectory,
    };
}

async function seedHostSkill(options: {
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>;
    skillName: string;
    metadataJson?: string;
}): Promise<string> {
    const universalHome = join(options.sandbox.env.HOME!, ".agents");
    const skillDirectory = join(universalHome, "skills", options.skillName);

    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), "# x\n");

    if (options.metadataJson !== undefined) {
        await writeFile(
            resolveManagedSkillMetadataFilePath(skillDirectory),
            options.metadataJson,
        );
    }

    return skillDirectory;
}

function nativeExecPath(sandbox: Awaited<ReturnType<typeof createCliSandbox>>): string {
    return selfUpdatePaths(sandbox).executablePath;
}

describe("oo uninstall", () => {
    test("--dry-run prints the plan and deletes nothing", async () => {
        const sandbox = await createCliSandbox();

        try {
            const runtime = await seedRuntime(sandbox);

            const result = await sandbox.run(["uninstall", "--dry-run"], {
                execPath: nativeExecPath(sandbox),
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("uninstall plan");
            // Nothing removed.
            expect(await Bun.file(runtime.executablePath).exists()).toBe(true);
            expect(await Bun.file(join(runtime.versionsDirectory, "1.2.3", "oo")).exists()).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("non-interactive without --yes refuses and deletes nothing", async () => {
        const sandbox = await createCliSandbox();

        try {
            const runtime = await seedRuntime(sandbox);

            const result = await sandbox.run(["uninstall"], {
                execPath: nativeExecPath(sandbox),
                stdout: { isTTY: false },
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("--yes");
            expect(await Bun.file(runtime.executablePath).exists()).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--yes removes runtime + bundled + preset, keeps registry/local/unmanaged", async () => {
        const sandbox = await createCliSandbox();

        try {
            const runtime = await seedRuntime(sandbox);
            const ooSkill = await seedHostSkill({
                sandbox,
                skillName: "oo",
                metadataJson: renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
            });
            const presetSkill = await seedHostSkill({
                sandbox,
                skillName: "gpt-image-2",
                metadataJson: renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: PRESET_PACKAGE,
                    version: "0.1.0",
                })),
            });
            const registrySkill = await seedHostSkill({
                sandbox,
                skillName: "demo",
                metadataJson: renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@alice/demo",
                    version: "0.2.0",
                })),
            });
            const localSkill = await seedHostSkill({
                sandbox,
                skillName: "mine",
                metadataJson: renderSkillMetadataJson(createLocalSkillMetadata()),
            });
            const unmanagedSkill = await seedHostSkill({
                sandbox,
                skillName: "handwritten",
            });

            const result = await sandbox.run(["uninstall", "--yes"], {
                execPath: nativeExecPath(sandbox),
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(0);

            if (process.platform === "win32") {
                // The running image cannot unlink itself in place, so its removal
                // is deferred to the post-exit helper: it is still present right
                // after this in-process run, and the message reports a scheduled
                // cleanup rather than a completed uninstall.
                expect(result.stdout).toContain("scheduled");
                expect(await Bun.file(runtime.executablePath).exists()).toBe(true);
            }
            else {
                expect(result.stdout).toContain("uninstalled");
                expect(await Bun.file(runtime.executablePath).exists()).toBe(false);
            }

            // Version directories are standalone copies, removed in-process on
            // every platform.
            expect(await Bun.file(join(runtime.versionsDirectory, "1.2.3", "oo")).exists()).toBe(false);
            expect(await Bun.file(join(ooSkill, "SKILL.md")).exists()).toBe(false);
            expect(await Bun.file(join(presetSkill, "SKILL.md")).exists()).toBe(false);
            // Retained
            expect(await Bun.file(join(registrySkill, "SKILL.md")).exists()).toBe(true);
            expect(await Bun.file(join(localSkill, "SKILL.md")).exists()).toBe(true);
            expect(await Bun.file(join(unmanagedSkill, "SKILL.md")).exists()).toBe(true);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--yes --purge removes auth/settings and all registry skills", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedRuntime(sandbox);
            const store = storePaths(sandbox);

            await mkdir(store.rootDirectory, { recursive: true });
            await writeFile(store.authFilePath, "id = \"\"\n");
            await writeFile(store.settingsFilePath, "x = 1\n");
            // A residual file that no explicit child item targets: it must still
            // be gone because --purge removes the whole config root.
            await writeFile(join(store.rootDirectory, "leftover.txt"), "x");
            const registrySkill = await seedHostSkill({
                sandbox,
                skillName: "demo",
                metadataJson: renderSkillMetadataJson(createRegistrySkillMetadata({
                    packageName: "@alice/demo",
                    version: "0.2.0",
                })),
            });
            const localSkill = await seedHostSkill({
                sandbox,
                skillName: "mine",
                metadataJson: renderSkillMetadataJson(createLocalSkillMetadata()),
            });

            const result = await sandbox.run(["uninstall", "--yes", "--purge"], {
                execPath: nativeExecPath(sandbox),
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(0);
            // Config files are not held open, so they are removed in-process on
            // every platform.
            expect(await Bun.file(store.authFilePath).exists()).toBe(false);
            expect(await Bun.file(store.settingsFilePath).exists()).toBe(false);
            // All registry skills removed under purge
            expect(await Bun.file(join(registrySkill, "SKILL.md")).exists()).toBe(false);
            // Local still retained even under purge
            expect(await Bun.file(join(localSkill, "SKILL.md")).exists()).toBe(true);

            if (process.platform === "win32") {
                // The running process may still hold open SQLite handles under the
                // config root, so its wholesale removal — and any residual files
                // like leftover.txt — is deferred to the post-exit helper. Right
                // after this in-process run the root is still present and the
                // message reports a scheduled cleanup rather than a completed one.
                expect(result.stdout).toContain("scheduled");
                expect(await Bun.file(join(store.rootDirectory, "leftover.txt")).exists()).toBe(true);
                expect(await pathExists(store.rootDirectory)).toBe(true);
            }
            else {
                expect(result.stdout).toContain("uninstalled");
                // The entire config root is removed in-process, including residual
                // files.
                expect(await Bun.file(join(store.rootDirectory, "leftover.txt")).exists()).toBe(false);
                expect(await pathExists(store.rootDirectory)).toBe(false);
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("package-manager install removes skills, keeps binary, exits 1 with guidance", async () => {
        const sandbox = await createCliSandbox();

        try {
            const ooSkill = await seedHostSkill({
                sandbox,
                skillName: "oo",
                metadataJson: renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
            });
            const npmExecPath = join(
                sandbox.env.HOME!,
                "node_modules",
                "@oomol-lab",
                "oo-cli",
                "bin",
                "oo.js",
            );

            const result = await sandbox.run(["uninstall", "--yes"], {
                execPath: npmExecPath,
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("npm uninstall -g @oomol-lab/oo-cli");
            // Bundled skill still removed even on a package-manager install.
            expect(await Bun.file(join(ooSkill, "SKILL.md")).exists()).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("package-manager install with empty plan still gives guidance and exits 1", async () => {
        const sandbox = await createCliSandbox();

        try {
            // No bundled/preset skills present, so the plan is empty. A
            // package-manager install must still surface binary guidance + exit 1.
            const homeDirectory = sandbox.env.HOME!;

            await mkdir(join(homeDirectory, ".agents"), { recursive: true });
            const npmExecPath = join(
                homeDirectory,
                "node_modules",
                "@oomol-lab",
                "oo-cli",
                "bin",
                "oo.js",
            );

            const result = await sandbox.run(["uninstall", "--yes"], {
                execPath: npmExecPath,
                version: "1.2.3",
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("npm uninstall -g @oomol-lab/oo-cli");
            // It did not falsely claim a successful uninstall.
            expect(result.stdout).not.toContain("uninstalled");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not leak secrets in output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedRuntime(sandbox);
            const store = storePaths(sandbox);

            await mkdir(store.rootDirectory, { recursive: true });
            await writeFile(store.authFilePath, "id = \"u\"\napi_key = \"secret-xyz\"\n");

            const result = await sandbox.run(["uninstall", "--yes", "--purge"], {
                execPath: nativeExecPath(sandbox),
                version: "1.2.3",
            });

            expect(result.stdout + result.stderr).not.toContain("secret-xyz");
            expect(result.stdout + result.stderr).not.toContain("api_key");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
