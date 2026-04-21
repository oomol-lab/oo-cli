import { posix, win32 } from "node:path";
import { describe, expect, test } from "bun:test";
import {
    resolveSelfUpdateLockFilePath,
    resolveSelfUpdatePaths,
    resolveSelfUpdateStagingBinaryPath,
    resolveSelfUpdateStagingDirectory,
    resolveSelfUpdateVersionFilePath,
} from "./paths.ts";

describe("resolveSelfUpdatePaths", () => {
    test("resolves Linux staging, versions, locks, and executable paths", () => {
        const paths = resolveSelfUpdatePaths({
            env: {
                HOME: "/tmp/home",
                XDG_CACHE_HOME: "/tmp/cache",
                XDG_DATA_HOME: "/tmp/data",
                XDG_RUNTIME_DIR: "/tmp/runtime",
            },
            platform: "linux",
        });

        expect(paths).toEqual({
            executableDirectory: posix.join("/tmp/home", ".local", "bin"),
            executablePath: posix.join("/tmp/home", ".local", "bin", "oo"),
            locksDirectory: posix.join("/tmp/runtime", "oo", "locks"),
            platform: "linux",
            stagingDirectory: posix.join("/tmp/cache", "oo", "staging"),
            versionsDirectory: posix.join("/tmp/data", "oo", "versions"),
        });
    });

    test("resolves macOS staging, versions, locks, and executable paths", () => {
        const paths = resolveSelfUpdatePaths({
            env: {
                HOME: "/tmp/home",
                TMPDIR: "/tmp/macos",
            },
            platform: "darwin",
        });

        expect(paths).toEqual({
            executableDirectory: posix.join("/tmp/home", ".local", "bin"),
            executablePath: posix.join("/tmp/home", ".local", "bin", "oo"),
            locksDirectory: posix.join("/tmp/macos", "oo", "locks"),
            platform: "darwin",
            stagingDirectory: posix.join("/tmp/home", "Library", "Caches", "oo", "staging"),
            versionsDirectory: posix.join(
                "/tmp/home",
                "Library",
                "Application Support",
                "oo",
                "versions",
            ),
        });
    });

    test("resolves Windows staging, versions, locks, and executable paths", () => {
        const paths = resolveSelfUpdatePaths({
            env: {
                APPDATA: "C:\\Users\\Kevin\\AppData\\Roaming",
                HOME: "C:\\Users\\Kevin",
                TEMP: "C:\\Temp",
                USERPROFILE: "C:\\Users\\Kevin",
            },
            platform: "win32",
        });

        expect(paths).toEqual({
            executableDirectory: win32.join("C:\\Users\\Kevin", ".local", "bin"),
            executablePath: win32.join("C:\\Users\\Kevin", ".local", "bin", "oo.exe"),
            locksDirectory: win32.join("C:\\Temp", "oo", "locks"),
            platform: "win32",
            stagingDirectory: win32.join("C:\\Temp", "oo", "staging"),
            versionsDirectory: win32.join(
                "C:\\Users\\Kevin\\AppData\\Roaming",
                "oo",
                "versions",
            ),
        });
    });

    test("builds lock, version, and staging paths", () => {
        const paths = resolveSelfUpdatePaths({
            env: {
                HOME: "/tmp/home",
            },
            platform: "linux",
        });

        expect(resolveSelfUpdateLockFilePath(paths, "1.2.3")).toBe(
            posix.join(paths.locksDirectory, "1.2.3.lock"),
        );
        expect(resolveSelfUpdateVersionFilePath(paths, "1.2.3")).toBe(
            posix.join(paths.versionsDirectory, "1.2.3"),
        );
        expect(resolveSelfUpdateStagingBinaryPath({
            paths,
            platform: "linux",
            processId: 123,
            timestamp: 456,
            version: "1.2.3",
        })).toBe(
            posix.join(paths.stagingDirectory, "1.2.3.tmp.123.456", "oo"),
        );
    });

    test("builds Windows helper paths with Windows separators", () => {
        const paths = resolveSelfUpdatePaths({
            env: {
                APPDATA: "C:\\Users\\Kevin\\AppData\\Roaming",
                HOME: "C:\\Users\\Kevin",
                TEMP: "C:\\Temp",
                USERPROFILE: "C:\\Users\\Kevin",
            },
            platform: "win32",
        });
        const stagingBinaryPath = resolveSelfUpdateStagingBinaryPath({
            paths,
            platform: "win32",
            processId: 123,
            timestamp: 456,
            version: "1.2.3",
        });

        expect(resolveSelfUpdateLockFilePath(paths, "1.2.3")).toBe(
            win32.join(paths.locksDirectory, "1.2.3.lock"),
        );
        expect(resolveSelfUpdateVersionFilePath(paths, "1.2.3")).toBe(
            win32.join(paths.versionsDirectory, "1.2.3"),
        );
        expect(stagingBinaryPath).toBe(
            win32.join(paths.stagingDirectory, "1.2.3.tmp.123.456", "oo.exe"),
        );
        expect(resolveSelfUpdateStagingDirectory(stagingBinaryPath, "win32")).toBe(
            win32.dirname(stagingBinaryPath),
        );
    });
});
