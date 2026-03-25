import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export interface ReadHistoricalLogOptions {
    directoryPath: string;
    excludeFilePath?: string;
    index?: number;
}

export async function readHistoricalLog(
    options: ReadHistoricalLogOptions,
): Promise<string | undefined> {
    const fileName = await resolveHistoricalLogFileName(options);

    if (!fileName) {
        return undefined;
    }

    return readFile(
        join(options.directoryPath, fileName),
        "utf8",
    ).catch(() => undefined);
}

async function resolveHistoricalLogFileName(
    options: ReadHistoricalLogOptions,
): Promise<string | undefined> {
    const fileNames = await readSortedLogFileNames(options.directoryPath);
    const excludedFileName = options.excludeFilePath
        ? basename(options.excludeFilePath)
        : undefined;
    const visibleFileNames = excludedFileName
        ? fileNames.filter(fileName => fileName !== excludedFileName)
        : fileNames;

    return visibleFileNames.at(-(options.index ?? 1));
}

async function readSortedLogFileNames(directoryPath: string): Promise<string[]> {
    const entries = await readdir(directoryPath, {
        withFileTypes: true,
    }).catch(() => []);

    return entries
        .flatMap((entry) => {
            if (!entry.isFile() || !entry.name.endsWith(".log")) {
                return [];
            }

            return [entry.name];
        })
        .sort((left, right) => left.localeCompare(right));
}
