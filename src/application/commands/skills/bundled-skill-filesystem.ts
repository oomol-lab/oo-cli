import {
    cp,
    lstat,
    mkdir,
    readlink,
    realpath,
    rm,
    rmdir,
    symlink,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import process from "node:process";

export interface BundledSkillPublicationResult {
    mode: "copy" | "symlink";
    path: string;
}

export type BundledSkillPublicationMode = "copy" | "symlink-or-copy";

interface BundledSkillPublicationDependencies {
    createDirectorySymlink?: (
        targetPath: string,
        linkPath: string,
    ) => Promise<boolean>;
}

type BundledSkillDirectorySymlinkAttempt
    = | {
        kind: "reuse";
    }
    | {
        kind: "create";
        resolvedLinkPath: string;
        resolvedTargetPath: string;
    };

export interface CreateBundledSkillDirectorySymlinkDependencies {
    lstat?: (path: string) => Promise<{
        isSymbolicLink: () => boolean;
    }>;
    mkdir?: (
        path: string,
        options: {
            recursive: true;
        },
    ) => Promise<void>;
    readlink?: (path: string) => Promise<string>;
    realpath?: (path: string) => Promise<string>;
    removePath?: (path: string) => Promise<void>;
    resolveParentSymlinks?: (path: string) => Promise<string>;
    symlink?: (
        targetPath: string,
        linkPath: string,
        type: "dir" | "junction",
    ) => Promise<void>;
}

export interface RemoveBundledSkillSymbolicPathDependencies {
    rm?: (
        path: string,
        options: {
            force: true;
        },
    ) => Promise<void>;
    rmdir?: (path: string) => Promise<void>;
}

export async function publishBundledSkillInstallation(
    options: {
        canonicalSkillDirectoryPath: string;
        installedSkillDirectoryPath: string;
        publicationMode?: BundledSkillPublicationMode;
    },
    dependencies: BundledSkillPublicationDependencies = {},
): Promise<BundledSkillPublicationResult> {
    const publicationMode = options.publicationMode ?? "symlink-or-copy";

    if (publicationMode === "symlink-or-copy") {
        const createDirectoryLink
            = dependencies.createDirectorySymlink ?? createBundledSkillDirectorySymlink;
        const symlinkCreated = await createDirectoryLink(
            options.canonicalSkillDirectoryPath,
            options.installedSkillDirectoryPath,
        );

        if (symlinkCreated) {
            return {
                mode: "symlink",
                path: options.installedSkillDirectoryPath,
            };
        }
    }

    await copyBundledSkillDirectory(
        options.canonicalSkillDirectoryPath,
        options.installedSkillDirectoryPath,
    );

    return {
        mode: "copy",
        path: options.installedSkillDirectoryPath,
    };
}

export function isNodeNotFoundError(
    error: unknown,
): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isSymlinkLoopError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ELOOP";
}

export async function createBundledSkillDirectorySymlink(
    targetPath: string,
    linkPath: string,
    dependencies: CreateBundledSkillDirectorySymlinkDependencies = {},
): Promise<boolean> {
    const lstatFn = dependencies.lstat ?? lstat;
    const mkdirFn = dependencies.mkdir ?? mkdir;
    const readlinkFn = dependencies.readlink ?? readlink;
    const realpathFn = dependencies.realpath ?? realpath;
    const removePathFn = dependencies.removePath ?? removePath;
    const resolveParentSymlinksFn
        = dependencies.resolveParentSymlinks ?? resolveParentSymlinks;
    const symlinkFn = dependencies.symlink ?? symlink;

    try {
        const attempt = await resolveBundledSkillDirectorySymlinkAttempt(
            targetPath,
            linkPath,
            {
                lstat: lstatFn,
                readlink: readlinkFn,
                realpath: realpathFn,
                removePath: removePathFn,
                resolveParentSymlinks: resolveParentSymlinksFn,
            },
        );

        if (attempt.kind === "reuse") {
            return true;
        }

        const linkDirectoryPath = dirname(attempt.resolvedLinkPath);

        await mkdirFn(linkDirectoryPath, { recursive: true });

        const symlinkTargetPath = process.platform === "win32"
            ? attempt.resolvedTargetPath
            : relative(
                    await resolveParentSymlinksFn(linkDirectoryPath),
                    attempt.resolvedTargetPath,
                );

        await symlinkFn(
            symlinkTargetPath,
            attempt.resolvedLinkPath,
            process.platform === "win32" ? "junction" : "dir",
        );

        return true;
    }
    catch {
        return false;
    }
}

async function resolveBundledSkillDirectorySymlinkAttempt(
    targetPath: string,
    linkPath: string,
    dependencies: Pick<
        CreateBundledSkillDirectorySymlinkDependencies,
        "lstat" | "readlink" | "realpath" | "removePath" | "resolveParentSymlinks"
    >,
): Promise<BundledSkillDirectorySymlinkAttempt> {
    const resolvedTargetPath = resolve(targetPath);
    const resolvedLinkPath = resolve(linkPath);
    const realpathFn = dependencies.realpath ?? realpath;
    const [realTargetPath, realLinkPath] = await Promise.all([
        realpathFn(resolvedTargetPath).catch(() => resolvedTargetPath),
        realpathFn(resolvedLinkPath).catch(() => resolvedLinkPath),
    ]);

    if (realTargetPath === realLinkPath) {
        return {
            kind: "reuse",
        };
    }

    const resolveParentSymlinksFn
        = dependencies.resolveParentSymlinks ?? resolveParentSymlinks;
    const [realTargetPathWithParents, realLinkPathWithParents] = await Promise.all([
        resolveParentSymlinksFn(resolvedTargetPath),
        resolveParentSymlinksFn(resolvedLinkPath),
    ]);

    if (realTargetPathWithParents === realLinkPathWithParents) {
        return {
            kind: "reuse",
        };
    }

    const lstatFn = dependencies.lstat ?? lstat;
    const readlinkFn = dependencies.readlink ?? readlink;
    const removePathFn = dependencies.removePath ?? removePath;

    try {
        const existingStats = await lstatFn(resolvedLinkPath);

        if (existingStats.isSymbolicLink()) {
            const existingTarget = await readlinkFn(resolvedLinkPath);

            if (
                resolveSymlinkTarget(resolvedLinkPath, existingTarget)
                === resolvedTargetPath
            ) {
                return {
                    kind: "reuse",
                };
            }
        }

        await removePathFn(resolvedLinkPath);
    }
    catch (error) {
        if (isSymlinkLoopError(error)) {
            try {
                await removePathFn(resolvedLinkPath);
            }
            catch {
                // Let symlink creation determine whether copy fallback is needed.
            }
        }
        else if (!isNodeNotFoundError(error)) {
            throw error;
        }
    }

    return {
        kind: "create",
        resolvedLinkPath,
        resolvedTargetPath,
    };
}

async function copyBundledSkillDirectory(
    sourcePath: string,
    destinationPath: string,
): Promise<void> {
    await removePath(destinationPath);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, {
        dereference: true,
        force: true,
        recursive: true,
    });
}

export async function removePath(path: string): Promise<void> {
    try {
        const pathStats = await lstat(path);

        if (pathStats.isSymbolicLink()) {
            await removeBundledSkillSymbolicPath(path);
            return;
        }

        await rm(path, { force: true, recursive: true });
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return;
        }

        throw error;
    }
}

export async function removeBundledSkillSymbolicPath(
    path: string,
    dependencies: RemoveBundledSkillSymbolicPathDependencies = {},
): Promise<void> {
    const rmFn = dependencies.rm ?? rm;
    const rmdirFn = dependencies.rmdir ?? rmdir;

    try {
        await rmFn(path, { force: true });
    }
    catch (error) {
        if (process.platform === "win32" && isWindowsBadAddressError(error)) {
            await rmdirFn(path);
            return;
        }

        throw error;
    }
}

function isWindowsBadAddressError(
    error: unknown,
): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "EFAULT";
}

async function resolveParentSymlinks(path: string): Promise<string> {
    const resolvedPath = resolve(path);
    const parentPath = dirname(resolvedPath);
    const baseName = basename(resolvedPath);

    try {
        const realParentPath = await realpath(parentPath);

        return join(realParentPath, baseName);
    }
    catch {
        return resolvedPath;
    }
}

function resolveSymlinkTarget(
    linkPath: string,
    linkTargetPath: string,
): string {
    return resolve(dirname(linkPath), linkTargetPath);
}
