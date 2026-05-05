import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isPathMissingError } from "../shared/fs-errors.ts";
import { readPathModule } from "./paths.ts";

export interface CommandPathCandidate {
    directoryPath: string;
    path: string;
}

const defaultWindowsExecutableExtensions = [
    ".com",
    ".exe",
    ".bat",
    ".cmd",
] as const;

export async function resolveCommandPathCandidates(options: {
    env: Record<string, string | undefined>;
    executableNames: readonly string[];
    pathExists?: (path: string) => Promise<boolean>;
    platform: NodeJS.Platform;
}): Promise<CommandPathCandidate[]> {
    const pathValue = readPathValue(options.env, options.platform);

    if (pathValue === undefined) {
        return [];
    }

    const pathModule = readPathModule(options.platform);
    const pathExists = options.pathExists
        ?? ((path: string) => commandPathExists(path, options.platform));
    const executableNames = resolveExecutableNamesForPathLookup({
        env: options.env,
        executableNames: options.executableNames,
        platform: options.platform,
    });
    const resolvedCandidates = await Promise.all(
        splitPathEntries(pathValue, options.platform).map(async (directoryPath) => {
            const candidatePath = await resolveFirstPathCandidatePath({
                directoryPath,
                executableNames,
                pathExists,
                pathModule,
            });

            if (candidatePath === undefined) {
                return undefined;
            }

            return {
                directoryPath,
                path: candidatePath,
            } satisfies CommandPathCandidate;
        }),
    );

    return resolvedCandidates.filter(
        (candidate): candidate is CommandPathCandidate => candidate !== undefined,
    );
}

function resolveExecutableNamesForPathLookup(options: {
    env: Record<string, string | undefined>;
    executableNames: readonly string[];
    platform: NodeJS.Platform;
}): string[] {
    if (options.platform !== "win32") {
        return [...options.executableNames];
    }

    const pathModule = readPathModule(options.platform);
    const executableExtensions = readWindowsExecutableExtensions(options.env);
    const names: string[] = [];
    const seenNames = new Set<string>();

    for (const executableName of options.executableNames) {
        const extension = pathModule.extname(executableName);
        const stem = extension === ""
            ? executableName
            : executableName.slice(0, -extension.length);
        const normalizedExtension = extension.toLowerCase();

        if (
            extension === ""
            || executableExtensions.includes(normalizedExtension)
        ) {
            for (const executableExtension of executableExtensions) {
                pushUniqueLookupName(
                    names,
                    seenNames,
                    `${stem}${executableExtension}`,
                );
            }
        }

        pushUniqueLookupName(names, seenNames, executableName);
    }

    return names;
}

function readWindowsExecutableExtensions(
    env: Record<string, string | undefined>,
): string[] {
    const configuredExtensions = env.PATHEXT
        ?.split(";")
        .map(normalizeWindowsExecutableExtension)
        .filter((extension): extension is string => extension !== undefined);
    const extensions = configuredExtensions === undefined
        || configuredExtensions.length === 0
        ? [...defaultWindowsExecutableExtensions]
        : configuredExtensions;
    const deduplicatedExtensions: string[] = [];
    const seenExtensions = new Set<string>();

    for (const extension of extensions) {
        pushUniqueLookupName(
            deduplicatedExtensions,
            seenExtensions,
            extension,
        );
    }

    return deduplicatedExtensions;
}

function normalizeWindowsExecutableExtension(
    rawExtension: string,
): string | undefined {
    const trimmedExtension = rawExtension.trim().toLowerCase();

    if (trimmedExtension === "") {
        return undefined;
    }

    return trimmedExtension.startsWith(".")
        ? trimmedExtension
        : `.${trimmedExtension}`;
}

function pushUniqueLookupName(
    values: string[],
    seenValues: Set<string>,
    value: string,
): void {
    const key = value.toLowerCase();

    if (seenValues.has(key)) {
        return;
    }

    seenValues.add(key);
    values.push(value);
}

function readPathValue(
    env: Record<string, string | undefined>,
    platform: NodeJS.Platform,
): string | undefined {
    return platform === "win32"
        ? env.Path ?? env.PATH
        : env.PATH;
}

function splitPathEntries(
    pathValue: string,
    platform: NodeJS.Platform,
): string[] {
    const isWindows = platform === "win32";
    const pathModule = readPathModule(platform);

    return pathValue
        .split(pathModule.delimiter)
        .map((pathEntry) => {
            const trimmedPathEntry = pathEntry.trim();

            return trimmedPathEntry === "" && !isWindows
                ? "."
                : trimmedPathEntry;
        });
}

async function resolveFirstPathCandidatePath(options: {
    directoryPath: string;
    executableNames: readonly string[];
    pathExists: (path: string) => Promise<boolean>;
    pathModule: ReturnType<typeof readPathModule>;
}): Promise<string | undefined> {
    for (const executableName of options.executableNames) {
        const candidatePath = options.pathModule.join(
            options.directoryPath,
            executableName,
        );

        if (await options.pathExists(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}

async function commandPathExists(
    path: string,
    platform: NodeJS.Platform,
): Promise<boolean> {
    const metadata = await stat(path).catch((error) => {
        if (isPathMissingError(error)) {
            return undefined;
        }

        throw error;
    });

    if (metadata === undefined || !metadata.isFile()) {
        return false;
    }

    if (platform === "win32") {
        return true;
    }

    return access(path, constants.X_OK).then(() => true).catch(() => false);
}
