import { chmod, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    joinPathEntries,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { resolveSelfUpdateCommandResolution } from "./command-resolution.ts";
import { resolveSelfUpdatePaths } from "./paths.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("resolveSelfUpdateCommandResolution", () => {
    test("reports managed when PATH resolves oo to the managed executable", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-command-resolution-managed");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });

        trackDirectory(rootDirectory);
        env.PATH = joinPathEntries([paths.executableDirectory], process.platform);
        await writeExecutable(paths.executablePath);

        const result = await resolveSelfUpdateCommandResolution({
            env,
            executablePath: paths.executablePath,
            platform: process.platform,
        });

        expect(result).toEqual({
            status: "managed",
        });
    });

    test("reports shadowed when another oo appears earlier on PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-command-resolution-shadowed");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const legacyDirectory = join(rootDirectory, "legacy", "bin");
        const legacyPath = join(legacyDirectory, basename(paths.executablePath));

        trackDirectory(rootDirectory);
        env.PATH = joinPathEntries(
            [legacyDirectory, paths.executableDirectory],
            process.platform,
        );
        await Promise.all([
            writeExecutable(paths.executablePath),
            writeExecutable(legacyPath),
        ]);

        const result = await resolveSelfUpdateCommandResolution({
            env,
            executablePath: paths.executablePath,
            platform: process.platform,
        });

        expect(result).toEqual({
            path: legacyPath,
            status: "shadowed",
        });
    });

    test("reports missing when PATH has no oo executable", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-command-resolution-missing");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });

        trackDirectory(rootDirectory);
        env.PATH = joinPathEntries([join(rootDirectory, "empty", "bin")], process.platform);
        await writeExecutable(paths.executablePath);

        const result = await resolveSelfUpdateCommandResolution({
            env,
            executablePath: paths.executablePath,
            platform: process.platform,
        });

        expect(result).toEqual({
            status: "missing",
        });
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

async function writeExecutable(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "binary");

    if (process.platform !== "win32") {
        await chmod(path, 0o755);
    }
}
