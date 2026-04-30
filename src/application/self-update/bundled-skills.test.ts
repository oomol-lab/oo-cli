import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { isManagedVersionExecutableInstalled } from "./bundled-skills.ts";
import {
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionExecutablePath,
} from "./paths.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("isManagedVersionExecutableInstalled", () => {
    test("returns true for an executable managed version file", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skills-executable");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const executablePath = resolveSelfUpdateVersionExecutablePath(paths, "1.2.3");

        trackDirectory(rootDirectory);
        await writeExecutable(executablePath);

        expect(await isManagedVersionExecutableInstalled({
            env,
            platform: process.platform,
            version: "1.2.3",
        })).toBeTrue();
    });

    test("returns false when the managed version command path is a directory", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skills-directory");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const executablePath = resolveSelfUpdateVersionExecutablePath(paths, "1.2.3");

        trackDirectory(rootDirectory);
        await mkdir(executablePath, { recursive: true });

        expect(await isManagedVersionExecutableInstalled({
            env,
            platform: process.platform,
            version: "1.2.3",
        })).toBeFalse();
    });

    test("returns false for a non-executable managed version file on POSIX", async () => {
        if (process.platform === "win32") {
            return;
        }

        const rootDirectory = await createTemporaryDirectory("oo-bundled-skills-non-executable");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const executablePath = resolveSelfUpdateVersionExecutablePath(paths, "1.2.3");

        trackDirectory(rootDirectory);
        await mkdir(dirname(executablePath), { recursive: true });
        await writeFile(executablePath, "binary", { mode: 0o644 });

        expect(await isManagedVersionExecutableInstalled({
            env,
            platform: process.platform,
            version: "1.2.3",
        })).toBeFalse();
    });
});

async function writeExecutable(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "binary");

    if (process.platform !== "win32") {
        await chmod(path, 0o755);
    }
}

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
