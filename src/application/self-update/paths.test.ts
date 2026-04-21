import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
    resolveSelfUpdateLockFilePath,
    resolveSelfUpdatePaths,
    resolveSelfUpdateStagingBinaryPath,
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
            executableDirectory: join("/tmp/home", ".local", "bin"),
            executablePath: join("/tmp/home", ".local", "bin", "oo"),
            locksDirectory: join("/tmp/runtime", "oo", "locks"),
            stagingDirectory: join("/tmp/cache", "oo", "staging"),
            versionsDirectory: join("/tmp/data", "oo", "versions"),
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
            executableDirectory: join("/tmp/home", ".local", "bin"),
            executablePath: join("/tmp/home", ".local", "bin", "oo"),
            locksDirectory: join("/tmp/macos", "oo", "locks"),
            stagingDirectory: join("/tmp/home", "Library", "Caches", "oo", "staging"),
            versionsDirectory: join(
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
            executableDirectory: join("C:\\Users\\Kevin", ".local", "bin"),
            executablePath: join("C:\\Users\\Kevin", ".local", "bin", "oo.exe"),
            locksDirectory: join("C:\\Temp", "oo", "locks"),
            stagingDirectory: join("C:\\Temp", "oo", "staging"),
            versionsDirectory: join(
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
            join(paths.locksDirectory, "1.2.3.lock"),
        );
        expect(resolveSelfUpdateVersionFilePath(paths, "1.2.3")).toBe(
            join(paths.versionsDirectory, "1.2.3"),
        );
        expect(resolveSelfUpdateStagingBinaryPath({
            paths,
            platform: "linux",
            processId: 123,
            timestamp: 456,
            version: "1.2.3",
        })).toBe(
            join(paths.stagingDirectory, "1.2.3.tmp.123.456", "oo"),
        );
    });
});
