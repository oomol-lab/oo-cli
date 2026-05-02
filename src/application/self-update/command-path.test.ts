import type { CommandPathCandidate } from "./command-path.ts";
import { posix, win32 } from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveCommandPathCandidates } from "./command-path.ts";

describe("resolveCommandPathCandidates", () => {
    test("treats an empty POSIX PATH value as the current-directory entry", async () => {
        const executableName = "oo";
        const executablePath = posix.join(".", executableName);
        const candidates = await resolveCandidates({
            env: {
                PATH: "",
            },
            executableNames: [executableName],
            existingPaths: [executablePath],
            platform: "linux",
        });

        expect(candidates).toEqual([
            {
                directoryPath: ".",
                path: executablePath,
            },
        ]);
    });

    test("preserves POSIX empty PATH segments as current-directory entries", async () => {
        const executableName = "oo";
        const currentDirectoryExecutablePath = posix.join(".", executableName);
        const managedDirectoryPath = posix.join("managed", "bin");
        const managedExecutablePath = posix.join(managedDirectoryPath, executableName);
        const candidates = await resolveCandidates({
            env: {
                PATH: `${posix.delimiter}${managedDirectoryPath}`,
            },
            executableNames: [executableName],
            existingPaths: [currentDirectoryExecutablePath, managedExecutablePath],
            platform: "linux",
        });

        expect(candidates).toEqual([
            {
                directoryPath: ".",
                path: currentDirectoryExecutablePath,
            },
            {
                directoryPath: managedDirectoryPath,
                path: managedExecutablePath,
            },
        ]);
    });

    test("preserves Windows empty PATH segments without rewriting them", async () => {
        const executableName = "oo.exe";
        const currentDirectoryExecutablePath = win32.join("", executableName);
        const managedDirectoryPath = win32.join("managed", "bin");
        const managedExecutablePath = win32.join(managedDirectoryPath, executableName);
        const candidates = await resolveCandidates({
            env: {
                Path: `${win32.delimiter}${managedDirectoryPath}`,
            },
            executableNames: [executableName],
            existingPaths: [currentDirectoryExecutablePath, managedExecutablePath],
            platform: "win32",
        });

        expect(candidates).toEqual([
            {
                directoryPath: "",
                path: currentDirectoryExecutablePath,
            },
            {
                directoryPath: managedDirectoryPath,
                path: managedExecutablePath,
            },
        ]);
    });
});

function resolveCandidates(options: {
    env: Record<string, string | undefined>;
    executableNames: readonly string[];
    existingPaths: readonly string[];
    platform: NodeJS.Platform;
}): Promise<CommandPathCandidate[]> {
    return resolveCommandPathCandidates({
        env: options.env,
        executableNames: options.executableNames,
        pathExists: createPathExists(options.existingPaths),
        platform: options.platform,
    });
}

function createPathExists(
    existingPaths: readonly string[],
): (path: string) => Promise<boolean> {
    return path => Promise.resolve(existingPaths.includes(path));
}
