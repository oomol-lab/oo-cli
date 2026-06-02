import { lstat, mkdir, readFile, realpath, rm, stat, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

import { describe, expect, test } from "bun:test";

import {
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import {
    publishBundledSkillInstallation,
} from "./bundled-skill-filesystem.ts";

describe("bundled skill publication", () => {
    test("copies the bundled skill into the installed path", async () => {
        const fixture = await createBundledSkillPublicationFixture();

        try {
            await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: fixture.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: fixture.installedSkillDirectoryPath,
            });

            expect(await readFile(join(fixture.installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await readFile(join(fixture.installedSkillDirectoryPath, "references", "contract.md"), "utf8")).toBe(
                "OOMOL\n",
            );
            expect(await realpath(fixture.installedSkillDirectoryPath)).not.toBe(
                await realpath(fixture.canonicalSkillDirectoryPath),
            );
            expect((await lstat(fixture.installedSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await fixture.cleanup();
        }
    });

    test("replaces an existing installed directory before copying", async () => {
        const fixture = await createBundledSkillPublicationFixture();

        try {
            await mkdir(fixture.installedSkillDirectoryPath, { recursive: true });
            await Bun.write(join(fixture.installedSkillDirectoryPath, "stale.txt"), "stale\n");

            await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: fixture.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: fixture.installedSkillDirectoryPath,
            });

            await expect(stat(join(fixture.installedSkillDirectoryPath, "stale.txt"))).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect((await lstat(fixture.installedSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await fixture.cleanup();
        }
    });

    test("replaces a historical symlink installation with a copied directory", async () => {
        const fixture = await createBundledSkillPublicationFixture();

        try {
            await mkdir(dirname(fixture.installedSkillDirectoryPath), { recursive: true });
            await symlink(
                fixture.canonicalSkillDirectoryPath,
                fixture.installedSkillDirectoryPath,
                process.platform === "win32" ? "junction" : "dir",
            );

            await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: fixture.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: fixture.installedSkillDirectoryPath,
            });

            expect(await readFile(join(fixture.installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(fixture.installedSkillDirectoryPath)).not.toBe(
                await realpath(fixture.canonicalSkillDirectoryPath),
            );
            expect((await lstat(fixture.installedSkillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await fixture.cleanup();
        }
    });
});

async function createBundledSkillPublicationFixture(): Promise<{
    canonicalSkillDirectoryPath: string;
    cleanup: () => Promise<void>;
    installedSkillDirectoryPath: string;
}> {
    const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
    const canonicalSkillDirectoryPath = join(
        rootDirectory,
        "config",
        "skills",
        "oo",
    );
    const installedSkillDirectoryPath = join(
        rootDirectory,
        ".agents",
        "skills",
        "oo",
    );

    await mkdir(join(canonicalSkillDirectoryPath, "references"), {
        recursive: true,
    });
    await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
    await Bun.write(
        join(canonicalSkillDirectoryPath, "references", "contract.md"),
        "OOMOL\n",
    );

    return {
        canonicalSkillDirectoryPath,
        cleanup: async () => {
            await rm(rootDirectory, { force: true, recursive: true });
        },
        installedSkillDirectoryPath,
    };
}
