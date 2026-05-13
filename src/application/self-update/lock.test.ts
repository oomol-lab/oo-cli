import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import {
    acquireActiveVersionMarker,
    acquireInstallVersionLock,
    cleanupStaleVersionLocks,
    findActiveVersionOwner,
    listActiveVersionLocks,
} from "./lock.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("self-update version locks", () => {
    test("creates same-version active markers without serializing owners", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-active-marker");
        const locksDirectory = join(rootDirectory, "locks");
        const firstMarkerPath = join(
            locksDirectory,
            "active",
            "1.2.3",
            `${process.pid}.marker-a.lock`,
        );
        const secondMarkerPath = join(
            locksDirectory,
            "active",
            "1.2.3",
            `${process.pid + 1}.marker-b.lock`,
        );

        trackDirectory(rootDirectory);

        const firstMarker = await acquireActiveVersionMarker({
            execPath: process.execPath,
            markerFilePath: firstMarkerPath,
            markerId: "marker-a",
            now: () => 1_700_000_000_000,
            processId: process.pid,
            version: "1.2.3",
        });
        const secondMarker = await acquireActiveVersionMarker({
            execPath: process.execPath,
            markerFilePath: secondMarkerPath,
            markerId: "marker-b",
            now: () => 1_700_000_001_000,
            processId: process.pid + 1,
            version: "1.2.3",
        });

        expect(firstMarker?.data).toEqual({
            acquiredAt: "2023-11-14T22:13:20.000Z",
            execPath: process.execPath,
            markerId: "marker-a",
            pid: process.pid,
            version: "1.2.3",
        });
        expect(secondMarker?.data.markerId).toBe("marker-b");
        await expect(Bun.file(firstMarkerPath).exists()).resolves.toBeTrue();
        await expect(Bun.file(secondMarkerPath).exists()).resolves.toBeTrue();

        await Promise.all([
            firstMarker?.close(),
            secondMarker?.close(),
        ]);
        await expect(Bun.file(firstMarkerPath).exists()).resolves.toBeFalse();
        await expect(Bun.file(secondMarkerPath).exists()).resolves.toBeFalse();
    });

    test("removes stale active, install, legacy, and malformed lock entries", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-cleanup");
        const locksDirectory = join(rootDirectory, "locks");
        const staleActiveMarkerPath = join(
            locksDirectory,
            "active",
            "1.2.3",
            "999999999.marker.lock",
        );
        const malformedActiveMarkerPath = join(
            locksDirectory,
            "active",
            "1.2.3",
            "malformed.lock",
        );
        const staleInstallLockPath = join(locksDirectory, "install", "2.0.0.lock");
        const staleLegacyLockPath = join(locksDirectory, "3.0.0.lock");
        const unexpectedDirectory = join(locksDirectory, "unexpected");

        trackDirectory(rootDirectory);
        await Promise.all([
            mkdir(join(locksDirectory, "active", "1.2.3"), { recursive: true }),
            mkdir(join(locksDirectory, "install"), { recursive: true }),
            mkdir(unexpectedDirectory, { recursive: true }),
        ]);
        await Promise.all([
            writeJsonFile(staleActiveMarkerPath, {
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                kind: "active",
                markerId: "marker",
                pid: 999_999_999,
                version: "1.2.3",
            }),
            writeFile(malformedActiveMarkerPath, "not-json"),
            writeJsonFile(staleInstallLockPath, {
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                kind: "install",
                pid: 999_999_999,
                version: "2.0.0",
            }),
            writeJsonFile(staleLegacyLockPath, {
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                pid: 999_999_999,
                version: "3.0.0",
            }),
        ]);

        await cleanupStaleVersionLocks({
            locksDirectory,
            platform: process.platform,
        });

        await expect(Bun.file(staleActiveMarkerPath).exists()).resolves.toBeFalse();
        await expect(Bun.file(malformedActiveMarkerPath).exists()).resolves.toBeFalse();
        await expect(Bun.file(join(locksDirectory, "active", "1.2.3")).exists()).resolves.toBeFalse();
        await expect(Bun.file(staleInstallLockPath).exists()).resolves.toBeFalse();
        await expect(Bun.file(staleLegacyLockPath).exists()).resolves.toBeFalse();
        await expect(Bun.file(unexpectedDirectory).exists()).resolves.toBeFalse();
    });

    test("lists live active markers and legacy locks without treating install locks as active", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-list");
        const locksDirectory = join(rootDirectory, "locks");
        const activeMarkerPath = join(
            locksDirectory,
            "active",
            "4.0.0",
            `${process.pid}.marker.lock`,
        );
        const installLockPath = join(locksDirectory, "install", "5.0.0.lock");
        const legacyLockPath = join(locksDirectory, "6.0.0.lock");

        trackDirectory(rootDirectory);
        await Promise.all([
            mkdir(join(locksDirectory, "active", "4.0.0"), { recursive: true }),
            mkdir(join(locksDirectory, "install"), { recursive: true }),
        ]);
        await Promise.all([
            writeJsonFile(activeMarkerPath, {
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                kind: "active",
                markerId: "marker",
                pid: process.pid,
                version: "4.0.0",
            }),
            writeJsonFile(installLockPath, {
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                kind: "install",
                pid: process.pid,
                version: "5.0.0",
            }),
            writeJsonFile(legacyLockPath, {
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                pid: process.pid,
                version: "6.0.0",
            }),
        ]);

        await cleanupStaleVersionLocks({
            locksDirectory,
            platform: process.platform,
        });
        const activeVersions = await listActiveVersionLocks({
            locksDirectory,
            platform: process.platform,
        });

        await expect(Bun.file(activeMarkerPath).exists()).resolves.toBeTrue();
        await expect(Bun.file(installLockPath).exists()).resolves.toBeTrue();
        await expect(Bun.file(legacyLockPath).exists()).resolves.toBeTrue();
        expect(activeVersions).toEqual(new Set(["4.0.0", "6.0.0"]));
    });

    test("returns a busy result with the owner pid when the install lock is active", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-busy");
        const lockFilePath = join(rootDirectory, "locks", "install", "1.2.3.lock");
        const delays: number[] = [];

        trackDirectory(rootDirectory);
        await mkdir(join(rootDirectory, "locks", "install"), { recursive: true });
        await writeJsonFile(lockFilePath, {
            acquiredAt: new Date().toISOString(),
            execPath: process.execPath,
            kind: "install",
            pid: process.pid,
            version: "1.2.3",
        });

        const result = await acquireInstallVersionLock({
            execPath: "/tmp/oo-other",
            lockFilePath,
            platform: process.platform,
            processId: process.pid + 1,
            sleep: async (ms) => {
                delays.push(ms);
            },
            version: "1.2.3",
        });

        expect(result).toEqual({
            ownerPid: process.pid,
            status: "busy",
        });
        expect(delays).toEqual([1000, 2000, 4000]);
    });

    test("finds active version owners and ignores the excluded process id", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-owner");
        const locksDirectory = join(rootDirectory, "locks");
        const markerPath = join(
            locksDirectory,
            "active",
            "1.2.3",
            `${process.pid}.marker.lock`,
        );

        trackDirectory(rootDirectory);
        await mkdir(join(locksDirectory, "active", "1.2.3"), { recursive: true });
        await writeJsonFile(markerPath, {
            acquiredAt: new Date().toISOString(),
            execPath: process.execPath,
            kind: "active",
            markerId: "marker",
            pid: process.pid,
            version: "1.2.3",
        });

        await expect(findActiveVersionOwner({
            excludeProcessId: process.pid,
            locksDirectory,
            platform: process.platform,
            version: "1.2.3",
        })).resolves.toBeUndefined();
        await expect(findActiveVersionOwner({
            locksDirectory,
            platform: process.platform,
            version: "1.2.3",
        })).resolves.toEqual({
            ownerPid: process.pid,
        });
    });

    if (process.platform === "win32") {
        test("treats a live pid as active when process command lines are unavailable", async () => {
            const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-substring");
            const lockFilePath = join(rootDirectory, "locks", "install", "1.2.3.lock");

            trackDirectory(rootDirectory);
            await mkdir(join(rootDirectory, "locks", "install"), { recursive: true });
            await writeJsonFile(lockFilePath, {
                acquiredAt: new Date().toISOString(),
                execPath: "/tmp/b",
                kind: "install",
                pid: process.pid,
                version: "1.2.3",
            });

            const result = await acquireInstallVersionLock({
                execPath: process.execPath,
                lockFilePath,
                platform: process.platform,
                processId: process.pid + 1,
                sleep: async () => {},
                version: "1.2.3",
            });

            expect(result).toEqual({
                ownerPid: process.pid,
                status: "busy",
            });
        });
    }
    else {
        test("does not treat basename substring matches as an active install lock owner", async () => {
            const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-substring");
            const lockFilePath = join(rootDirectory, "locks", "install", "1.2.3.lock");

            trackDirectory(rootDirectory);
            await mkdir(join(rootDirectory, "locks", "install"), { recursive: true });
            await writeJsonFile(lockFilePath, {
                acquiredAt: new Date().toISOString(),
                execPath: "/tmp/b",
                kind: "install",
                pid: process.pid,
                version: "1.2.3",
            });

            const result = await acquireInstallVersionLock({
                execPath: process.execPath,
                lockFilePath,
                platform: process.platform,
                processId: process.pid + 1,
                sleep: async () => {},
                version: "1.2.3",
            });

            expect(result.status).toBe("acquired");
        });
    }
});

async function writeJsonFile(path: string, value: object): Promise<void> {
    await writeFile(path, `${JSON.stringify(value)}\n`);
}
