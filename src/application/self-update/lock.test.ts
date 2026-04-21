import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { acquireVersionLock, cleanupStaleVersionLocks } from "./lock.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("self-update version locks", () => {
    test("removes stale and malformed lock entries", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-lock");
        const locksDirectory = join(rootDirectory, "locks");

        trackDirectory(rootDirectory);
        await mkdir(join(locksDirectory, "legacy.lock"), { recursive: true });
        await Promise.all([
            writeFile(
                join(locksDirectory, "stale.lock"),
                JSON.stringify({
                    acquiredAt: new Date().toISOString(),
                    execPath: process.execPath,
                    pid: 999_999_999,
                    version: "1.2.3",
                }),
            ),
            writeFile(
                join(locksDirectory, "invalid.lock"),
                "not-json",
            ),
        ]);

        await cleanupStaleVersionLocks({
            locksDirectory,
            platform: process.platform,
        });

        await expect(Bun.file(join(locksDirectory, "stale.lock")).exists()).resolves.toBeFalse();
        await expect(Bun.file(join(locksDirectory, "invalid.lock")).exists()).resolves.toBeFalse();
        await expect(Bun.file(join(locksDirectory, "legacy.lock")).exists()).resolves.toBeFalse();
    });

    test("returns a busy result with the owner pid when the lock is active", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-busy");
        const lockFilePath = join(rootDirectory, "1.2.3.lock");

        trackDirectory(rootDirectory);
        await mkdir(rootDirectory, { recursive: true });
        await writeFile(
            lockFilePath,
            `${JSON.stringify({
                acquiredAt: new Date().toISOString(),
                execPath: process.execPath,
                pid: process.pid,
                version: "1.2.3",
            })}\n`,
        );

        const result = await acquireVersionLock({
            execPath: "/tmp/oo-other",
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

    test("does not treat basename substring matches as an active lock owner", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-lock-substring");
        const lockFilePath = join(rootDirectory, "1.2.3.lock");

        trackDirectory(rootDirectory);
        await mkdir(rootDirectory, { recursive: true });
        await writeFile(
            lockFilePath,
            `${JSON.stringify({
                acquiredAt: new Date().toISOString(),
                execPath: "/tmp/b",
                pid: process.pid,
                version: "1.2.3",
            })}\n`,
        );

        const result = await acquireVersionLock({
            execPath: process.execPath,
            lockFilePath,
            platform: process.platform,
            processId: process.pid + 1,
            sleep: async () => {},
            version: "1.2.3",
        });

        expect(result.status).toBe("acquired");
    });
});
