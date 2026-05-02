import { pathExists as defaultPathExists } from "../shared/fs-utils.ts";
import { readPathModule } from "./paths.ts";

export interface CommandPathCandidate {
    directoryPath: string;
    path: string;
}

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
    const pathExists = options.pathExists ?? defaultPathExists;
    const resolvedCandidates = await Promise.all(
        splitPathEntries(pathValue, options.platform).map(async (directoryPath) => {
            const candidatePath = await resolveFirstPathCandidatePath({
                directoryPath,
                executableNames: options.executableNames,
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

            if (trimmedPathEntry === "" && !isWindows) {
                return ".";
            }

            return trimmedPathEntry;
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
