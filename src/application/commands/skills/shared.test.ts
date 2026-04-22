import { mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createTemporaryDirectory,
    platformDescribe,
} from "../../../../__tests__/helpers.ts";
import {
    createBundledSkillDirectorySymlink,
    publishBundledSkillInstallation,
    removeBundledSkillSymbolicPath,
} from "./bundled-skill-filesystem.ts";

describe("bundled skill publication", () => {
    test("publishes the bundled skill through a symlink-compatible path", async () => {
        const fixture = await createBundledSkillPublicationFixture();

        try {
            const result = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: fixture.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: fixture.installedSkillDirectoryPath,
            });

            expect(result).toEqual({
                mode: "symlink",
                path: fixture.installedSkillDirectoryPath,
            });
            expect(await readFile(join(fixture.installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(fixture.installedSkillDirectoryPath)).toBe(
                await realpath(fixture.canonicalSkillDirectoryPath),
            );
        }
        finally {
            await fixture.cleanup();
        }
    });

    test("falls back to copying when symlink creation fails", async () => {
        const fixture = await createBundledSkillPublicationFixture();

        try {
            const result = await publishBundledSkillInstallation(
                {
                    canonicalSkillDirectoryPath: fixture.canonicalSkillDirectoryPath,
                    installedSkillDirectoryPath: fixture.installedSkillDirectoryPath,
                },
                {
                    createDirectorySymlink: async () => false,
                },
            );

            expect(result).toEqual({
                mode: "copy",
                path: fixture.installedSkillDirectoryPath,
            });
            expect(await readFile(join(fixture.installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(fixture.installedSkillDirectoryPath)).not.toBe(
                await realpath(fixture.canonicalSkillDirectoryPath),
            );
        }
        finally {
            await fixture.cleanup();
        }
    });

    test("copies directly when publication mode disables symlinks", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const canonicalSkillDirectoryPath = join(
            rootDirectory,
            "config",
            "skills",
            "oo",
        );
        const installedSkillDirectoryPath = join(
            rootDirectory,
            ".openclaw",
            "skills",
            "oo",
        );

        try {
            await mkdir(join(canonicalSkillDirectoryPath, "references"), {
                recursive: true,
            });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
            await Bun.write(
                join(canonicalSkillDirectoryPath, "references", "guide.md"),
                "guide\n",
            );

            const result = await publishBundledSkillInstallation(
                {
                    canonicalSkillDirectoryPath,
                    installedSkillDirectoryPath,
                    publicationMode: "copy",
                },
                {
                    createDirectorySymlink: async () => {
                        throw new Error("copy mode should skip symlink creation");
                    },
                },
            );

            expect(result).toEqual({
                mode: "copy",
                path: installedSkillDirectoryPath,
            });
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await readFile(join(installedSkillDirectoryPath, "references", "guide.md"), "utf8")).toBe(
                "guide\n",
            );
            expect(await realpath(installedSkillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("returns false when symlink creation throws", async () => {
        const result = await createBundledSkillDirectorySymlink(
            "/tmp/canonical/skills/oo",
            "/tmp/agent/skills/oo",
            {
                lstat: async () => {
                    const error = new Error("missing") as NodeJS.ErrnoException;

                    error.code = "ENOENT";

                    throw error;
                },
                mkdir: async () => undefined,
                readlink: async () => {
                    throw new Error("readlink should not run when the link is missing");
                },
                realpath: async path => path,
                removePath: async () => {
                    throw new Error("removePath should not run when the link is missing");
                },
                resolveParentSymlinks: async path => path,
                symlink: async () => {
                    throw new Error("boom");
                },
            },
        );

        expect(result).toBeFalse();
    });

    test("replaces an existing directory at the installed path before creating a symlink", async () => {
        const fixture = await createBundledSkillPublicationFixture();

        try {
            await mkdir(fixture.installedSkillDirectoryPath, { recursive: true });
            await Bun.write(join(fixture.installedSkillDirectoryPath, "stale.txt"), "stale\n");

            const result = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: fixture.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: fixture.installedSkillDirectoryPath,
            });

            expect(result).toEqual({
                mode: "symlink",
                path: fixture.installedSkillDirectoryPath,
            });
            expect(await realpath(fixture.installedSkillDirectoryPath)).toBe(
                await realpath(fixture.canonicalSkillDirectoryPath),
            );
            await expect(stat(join(fixture.installedSkillDirectoryPath, "stale.txt"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await fixture.cleanup();
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
});

registerPosixBundledSkillPublicationTests("darwin");
registerPosixBundledSkillPublicationTests("linux");

platformDescribe.win32("bundled skill publication on win32", () => {
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

function registerPosixBundledSkillPublicationTests(
    platform: "darwin" | "linux",
): void {
    const scopedDescribe = platform === "darwin"
        ? platformDescribe.darwin
        : platformDescribe.linux;

    scopedDescribe(`bundled skill publication on ${platform}`, () => {
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

        test("uses the symlink-resolved parent directory when computing a relative POSIX target", async () => {
            const createdSymlinks: Array<{
                linkPath: string;
                targetPath: string;
                type: string | null | undefined;
            }> = [];
            const targetPath = "/tmp/canonical/skills/oo";
            const linkPath = "/tmp/link-parent/skills/oo";
            const resolvedTargetPath = resolve(targetPath);
            const resolvedLinkPath = resolve(linkPath);
            const resolvedLinkDirectoryPath = dirname(resolvedLinkPath);
            const realLinkDirectoryPath = "/private/tmp/link-parent/skills";

            const result = await createBundledSkillDirectorySymlink(
                targetPath,
                linkPath,
                {
                    lstat: async () => {
                        const error = new Error("missing") as NodeJS.ErrnoException;

                        error.code = "ENOENT";

                        throw error;
                    },
                    mkdir: async () => undefined,
                    readlink: async () => {
                        throw new Error("readlink should not run when the link is missing");
                    },
                    realpath: async path => path,
                    removePath: async () => {
                        throw new Error("removePath should not run when the link is missing");
                    },
                    resolveParentSymlinks: async path =>
                        path === resolvedLinkDirectoryPath ? realLinkDirectoryPath : path,
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
            expect(createdSymlinks).toEqual([
                {
                    linkPath: resolvedLinkPath,
                    targetPath: relative(realLinkDirectoryPath, resolvedTargetPath),
                    type: "dir",
                },
            ]);
        });

        test("rethrows EFAULT when removing a symbolic path on POSIX", async () => {
            const symlinkPath = "/tmp/.codex/skills/oo";

            await expect(removeBundledSkillSymbolicPath(symlinkPath, {
                rm: async () => {
                    const error = new Error("bad address") as NodeJS.ErrnoException;

                    error.code = "EFAULT";

                    throw error;
                },
                rmdir: async () => {
                    throw new Error("rmdir should not run on POSIX");
                },
            })).rejects.toMatchObject({
                code: "EFAULT",
            });
        });
    });
}

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
        ".codex",
        "skills",
        "oo",
    );

    await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
        recursive: true,
    });
    await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
    await Bun.write(
        join(canonicalSkillDirectoryPath, "agents", "openai.yaml"),
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
