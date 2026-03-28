import { mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    createBundledSkillDirectorySymlink,
    publishBundledSkillInstallation,
    removeBundledSkillSymbolicPath,
} from "./shared.ts";

describe("bundled skill publication", () => {
    test("publishes the bundled skill through a symlink-compatible path", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const canonicalSkillDirectoryPath = join(
            rootDirectory,
            "config",
            "skills",
            "oo",
        );
        const installedSkillDirectoryPath = join(
            rootDirectory,
            ".codex",
            "skills",
            "oo",
        );

        try {
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
            await Bun.write(
                join(canonicalSkillDirectoryPath, "agents", "openai.yaml"),
                "OOMOL\n",
            );

            const result = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
            });

            expect(result).toEqual({
                mode: "symlink",
                path: installedSkillDirectoryPath,
            });
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(installedSkillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("falls back to copying when symlink creation fails", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const canonicalSkillDirectoryPath = join(
            rootDirectory,
            "config",
            "skills",
            "oo",
        );
        const installedSkillDirectoryPath = join(
            rootDirectory,
            ".codex",
            "skills",
            "oo",
        );

        try {
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
            await Bun.write(
                join(canonicalSkillDirectoryPath, "agents", "openai.yaml"),
                "OOMOL\n",
            );

            const result = await publishBundledSkillInstallation(
                {
                    canonicalSkillDirectoryPath,
                    installedSkillDirectoryPath,
                },
                {
                    createDirectorySymlink: async () => false,
                },
            );

            expect(result).toEqual({
                mode: "copy",
                path: installedSkillDirectoryPath,
            });
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(installedSkillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("replaces an existing directory at the installed path before creating a symlink", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const canonicalSkillDirectoryPath = join(
            rootDirectory,
            "config",
            "skills",
            "oo",
        );
        const installedSkillDirectoryPath = join(
            rootDirectory,
            ".codex",
            "skills",
            "oo",
        );

        try {
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
            await Bun.write(
                join(canonicalSkillDirectoryPath, "agents", "openai.yaml"),
                "OOMOL\n",
            );
            await mkdir(installedSkillDirectoryPath, { recursive: true });
            await Bun.write(join(installedSkillDirectoryPath, "stale.txt"), "stale\n");

            const result = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
            });

            expect(result).toEqual({
                mode: "symlink",
                path: installedSkillDirectoryPath,
            });
            expect(await realpath(installedSkillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            await expect(stat(join(installedSkillDirectoryPath, "stale.txt"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("reuses an existing symlink when it already points to the target", async () => {
        const createdSymlinks: Array<{
            linkPath: string;
            targetPath: string;
            type: string | null | undefined;
        }> = [];

        const result = await createBundledSkillDirectorySymlink(
            "/tmp/canonical/skills/oo",
            "/tmp/agent/skills/oo",
            {
                lstat: async () => ({
                    isSymbolicLink: () => true,
                }),
                mkdir: async () => undefined,
                readlink: async () => "../../canonical/skills/oo",
                realpath: async path => path,
                removePath: async () => {
                    throw new Error("expected the existing symlink to be reused");
                },
                resolveParentSymlinks: async path => path,
                symlink: async (targetPath, linkPath, type) => {
                    createdSymlinks.push({ linkPath, targetPath, type });
                },
            },
        );

        expect(result).toBeTrue();
        expect(createdSymlinks).toHaveLength(0);
    });

    test("replaces an existing directory before creating a symlink", async () => {
        const removedPaths: string[] = [];
        const createdSymlinks: Array<{
            linkPath: string;
            targetPath: string;
            type: string | null | undefined;
        }> = [];
        const targetPath = "/tmp/canonical/skills/oo";
        const linkPath = "/tmp/agent/skills/oo";
        const resolvedTargetPath = resolve(targetPath);
        const resolvedLinkPath = resolve(linkPath);

        const result = await createBundledSkillDirectorySymlink(
            targetPath,
            linkPath,
            {
                lstat: async () => ({
                    isSymbolicLink: () => false,
                }) as Awaited<ReturnType<typeof stat>>,
                mkdir: async () => undefined,
                readlink: async () => {
                    throw new Error("readlink should not run for directories");
                },
                realpath: async path => path,
                removePath: async (path) => {
                    removedPaths.push(path);
                },
                resolveParentSymlinks: async path => path,
                symlink: async (createdTargetPath, createdLinkPath, type) => {
                    createdSymlinks.push({
                        linkPath: createdLinkPath,
                        targetPath: createdTargetPath,
                        type,
                    });
                },
            },
        );

        expect(result).toBeTrue();
        expect(removedPaths).toEqual([resolvedLinkPath]);
        expect(createdSymlinks).toEqual([
            {
                linkPath: resolvedLinkPath,
                targetPath: relative(dirname(resolvedLinkPath), resolvedTargetPath),
                type: "dir",
            },
        ]);
    });

    test("cleans a broken symlink loop before creating a junction in win32 mode", async () => {
        const removedPaths: string[] = [];
        const createdSymlinks: Array<{
            linkPath: string;
            targetPath: string;
            type: string | null | undefined;
        }> = [];
        const targetPath = "/windows/canonical/oo";
        const linkPath = "/windows/agent/oo";
        const resolvedTargetPath = resolve(targetPath);
        const resolvedLinkPath = resolve(linkPath);

        const result = await createBundledSkillDirectorySymlink(
            targetPath,
            linkPath,
            {
                lstat: async () => {
                    const error = new Error("loop") as NodeJS.ErrnoException;

                    error.code = "ELOOP";

                    throw error;
                },
                mkdir: async () => undefined,
                readlink: async () => {
                    throw new Error("readlink should not run when lstat fails");
                },
                realpath: async path => path,
                removePath: async (path) => {
                    removedPaths.push(path);
                },
                resolveParentSymlinks: async path => path,
                symlink: async (createdTargetPath, createdLinkPath, type) => {
                    createdSymlinks.push({
                        linkPath: createdLinkPath,
                        targetPath: createdTargetPath,
                        type,
                    });
                },
                platform: "win32",
            },
        );

        expect(result).toBeTrue();
        expect(removedPaths).toEqual([resolvedLinkPath]);
        expect(createdSymlinks).toEqual([
            {
                linkPath: resolvedLinkPath,
                targetPath: resolvedTargetPath,
                type: "junction",
            },
        ]);
    });

    test("falls back to rmdir when removing a junction hits EFAULT on win32", async () => {
        const removedWithRmdir: string[] = [];
        const junctionPath = "C:\\Users\\Tester\\.codex\\skills\\oo";

        await removeBundledSkillSymbolicPath(junctionPath, {
            platform: "win32",
            rm: async () => {
                const error = new Error("bad address") as NodeJS.ErrnoException;

                error.code = "EFAULT";

                throw error;
            },
            rmdir: async (path) => {
                removedWithRmdir.push(path);
            },
        });

        expect(removedWithRmdir).toEqual([junctionPath]);
    });
});
