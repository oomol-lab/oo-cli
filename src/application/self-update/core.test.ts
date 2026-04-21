import { chmod, mkdir, readlink, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { performSelfUpdateOperation } from "./core.ts";
import {
    resolveSelfUpdateLockFilePath,
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionFilePath,
} from "./paths.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("performSelfUpdateOperation", () => {
    test("re-activates an existing target version without downloading again", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-core");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const targetVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "1.2.3",
        );
        const logCapture = createLogCapture();
        let fetchCount = 0;

        trackDirectory(rootDirectory);
        await mkdir(paths.versionsDirectory, { recursive: true });
        await writeManagedVersion(targetVersionPath);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: false,
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => {
                        fetchCount += 1;
                        throw new Error("binary download should not be called");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "1.2.3",
            });

            expect(result.status).toBe("installed");
            expect(fetchCount).toBe(0);

            if (process.platform === "win32") {
                await expect(Bun.file(paths.executablePath).exists()).resolves.toBeTrue();
            }
            else {
                const linkedTarget = await readlink(paths.executablePath);
                const resolvedLinkedTarget = await realpath(
                    linkedTarget.startsWith("/")
                        ? linkedTarget
                        : join(paths.executableDirectory, linkedTarget),
                );

                expect(resolvedLinkedTarget).toBe(await realpath(targetVersionPath));
            }
        }
        finally {
            logCapture.close();
        }
    });

    test("keeps versions protected by active locks during cleanup", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-cleanup");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);
        await Promise.all([
            mkdir(paths.locksDirectory, { recursive: true }),
            mkdir(paths.versionsDirectory, { recursive: true }),
        ]);
        await Promise.all([
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "1.0.0")),
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "2.0.0")),
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "9.9.9")),
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "0.5.0")),
            writeFile(
                resolveSelfUpdateLockFilePath(paths, "9.9.9"),
                `${JSON.stringify({
                    acquiredAt: new Date().toISOString(),
                    execPath: process.execPath,
                    pid: process.pid,
                    version: "9.9.9",
                })}\n`,
            ),
        ]);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: false,
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => {
                        throw new Error("binary download should not be called");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "2.0.0",
            });

            expect(result.status).toBe("installed");
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "1.0.0")).exists(),
            ).resolves.toBeTrue();
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "2.0.0")).exists(),
            ).resolves.toBeTrue();
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "9.9.9")).exists(),
            ).resolves.toBeTrue();
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "0.5.0")).exists(),
            ).resolves.toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });
});

function createSelfUpdateEnv(rootDirectory: string): Record<string, string | undefined> {
    return {
        APPDATA: join(rootDirectory, "appdata"),
        HOME: rootDirectory,
        TEMP: join(rootDirectory, "temp"),
        TMP: join(rootDirectory, "temp"),
        TMPDIR: join(rootDirectory, "tmpdir"),
        USERPROFILE: rootDirectory,
        XDG_CACHE_HOME: join(rootDirectory, "cache"),
        XDG_DATA_HOME: join(rootDirectory, "data"),
        XDG_RUNTIME_DIR: join(rootDirectory, "runtime"),
    };
}

async function writeManagedVersion(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "binary");

    if (process.platform !== "win32") {
        await chmod(path, 0o755);
    }
}
