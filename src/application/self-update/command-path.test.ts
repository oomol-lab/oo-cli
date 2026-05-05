import type { CommandPathCandidate } from "./command-path.ts";
import { posix, win32 } from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveCommandPathCandidates } from "./command-path.ts";

describe("resolveCommandPathCandidates", () => {
    test("returns candidates in PATH order", async () => {
        const firstDirectoryPath = posix.join("first", "bin");
        const secondDirectoryPath = posix.join("second", "bin");
        const executableName = "oo";
        const firstExecutablePath = posix.join(firstDirectoryPath, executableName);
        const secondExecutablePath = posix.join(secondDirectoryPath, executableName);

        const candidates = await resolveCandidates({
            env: {
                PATH: [firstDirectoryPath, secondDirectoryPath].join(posix.delimiter),
            },
            executableNames: [executableName],
            existingPaths: [secondExecutablePath, firstExecutablePath],
            platform: "linux",
        });

        expect(candidates).toEqual([
            {
                directoryPath: firstDirectoryPath,
                path: firstExecutablePath,
            },
            {
                directoryPath: secondDirectoryPath,
                path: secondExecutablePath,
            },
        ]);
    });

    test("skips PATH candidates whose probe rejects", async () => {
        const brokenDirectoryPath = posix.join("broken", "bin");
        const managedDirectoryPath = posix.join("managed", "bin");
        const executableName = "oo";
        const brokenExecutablePath = posix.join(brokenDirectoryPath, executableName);
        const managedExecutablePath = posix.join(managedDirectoryPath, executableName);

        const candidates = await resolveCommandPathCandidates({
            env: {
                PATH: [brokenDirectoryPath, managedDirectoryPath].join(posix.delimiter),
            },
            executableNames: [executableName],
            pathExists: (path) => {
                if (path === brokenExecutablePath) {
                    return Promise.reject(new Error("permission denied"));
                }

                return Promise.resolve(path === managedExecutablePath);
            },
            platform: "linux",
        });

        expect(candidates).toEqual([
            {
                directoryPath: managedDirectoryPath,
                path: managedExecutablePath,
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

    test("resolves Windows PATHEXT shims before later managed executables", async () => {
        const executableName = "oo.exe";
        const legacyDirectoryPath = win32.join("legacy", "bin");
        const managedDirectoryPath = win32.join("managed", "bin");
        const legacyShimPath = win32.join(legacyDirectoryPath, "oo.cmd");
        const managedExecutablePath = win32.join(managedDirectoryPath, executableName);

        const candidates = await resolveCandidates({
            env: {
                Path: [legacyDirectoryPath, managedDirectoryPath].join(win32.delimiter),
            },
            executableNames: [executableName],
            existingPaths: [managedExecutablePath, legacyShimPath],
            platform: "win32",
        });

        expect(candidates).toEqual([
            {
                directoryPath: legacyDirectoryPath,
                path: legacyShimPath,
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
