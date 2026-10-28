import type { Logger } from "pino";
import type { resolveSelfUpdatePaths } from "./paths.ts";
import { readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { isFileMissingError } from "../shared/fs-errors.ts";

export async function cleanupWindowsExecutableBackups(
    paths: Pick<ReturnType<typeof resolveSelfUpdatePaths>, "executableDirectory" | "executablePath">,
    logger: Logger,
): Promise<void> {
    const entries = await readDirectoryEntries(paths.executableDirectory);
    const backupPrefix = `${basename(paths.executablePath)}.old.`;

    await Promise.all(entries
        .filter(entry => entry.startsWith(backupPrefix))
        .map(entry =>
            removePathBestEffort(join(paths.executableDirectory, entry)),
        ));

    logger.debug(
        {
            executableDirectory: paths.executableDirectory,
        },
        "CLI self-update executable-backup cleanup completed.",
    );
}

export async function readDirectoryEntries(path: string): Promise<string[]> {
    try {
        return await readdir(path);
    }
    catch (error) {
        if (isFileMissingError(error)) {
            return [];
        }

        throw error;
    }
}

export async function removePathBestEffort(path: string): Promise<void> {
    await rm(path, {
        force: true,
        recursive: true,
    }).catch(() => {});
}
