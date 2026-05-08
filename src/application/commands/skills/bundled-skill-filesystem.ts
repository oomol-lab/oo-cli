import {
    cp,
    lstat,
    mkdir,
    rm,
    rmdir,
} from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

export async function publishBundledSkillInstallation(
    options: {
        canonicalSkillDirectoryPath: string;
        installedSkillDirectoryPath: string;
    },
): Promise<void> {
    await mkdir(dirname(options.installedSkillDirectoryPath), { recursive: true });
    await copyBundledSkillDirectory(
        options.canonicalSkillDirectoryPath,
        options.installedSkillDirectoryPath,
    );
}

export function isNodeNotFoundError(
    error: unknown,
): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function copyBundledSkillDirectory(
    sourcePath: string,
    destinationPath: string,
): Promise<void> {
    await removePath(destinationPath);
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
            await removeSymbolicPath(path);
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

async function removeSymbolicPath(
    path: string,
): Promise<void> {
    try {
        await rm(path, { force: true });
    }
    catch (error) {
        if (process.platform === "win32" && isWindowsBadAddressError(error)) {
            await rmdir(path);
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
