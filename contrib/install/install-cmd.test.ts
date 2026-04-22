import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, win32 } from "node:path";

import { beforeAll, describe, expect, test } from "bun:test";
import { createTemporaryDirectory, useTemporaryDirectoryCleanup } from "../../__tests__/helpers.ts";

const installScriptPath = join(import.meta.dir, "install.cmd");
const windowsCmdTest = process.platform === "win32" ? test : test.skip;
const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("install.cmd", () => {
    let scriptContent: string;

    beforeAll(async () => {
        scriptContent = await readFile(installScriptPath, "utf8");
    });

    test("declares the expected release URL and Windows executable suffix", () => {
        expect(scriptContent).toContain("https://static.oomol.com/release/apps/oo-cli");
        expect(scriptContent).toContain("latest.json");
        expect(scriptContent).toContain("oo.exe");
    });

    test("uses %APPDATA%\\oo\\downloads as the default Windows download directory", () => {
        expect(scriptContent).toContain("%APPDATA%\\oo\\downloads");
        expect(scriptContent).toContain("%USERPROFILE%\\AppData\\Roaming\\oo\\downloads");
    });

    test("supports environment overrides and the win32 platform ids", () => {
        expect(scriptContent).toContain("OO_INSTALL_DOWNLOAD_BASE_URL");
        expect(scriptContent).toContain("OO_INSTALL_DOWNLOAD_DIR");
        expect(scriptContent).toContain("OO_INSTALL_PLATFORM");
        expect(scriptContent).toContain("OO_INSTALL_SKIP_RUN_INSTALL");
        expect(scriptContent).toContain("win32-x64");
        expect(scriptContent).toContain("win32-arm64");
    });

    test("extracts the version field with cmd-compatible string substitutions", () => {
        expect(scriptContent).toContain("set \"AFTER=!CONTENT:*\"version\":\"=!\"");
        expect(scriptContent).toContain("set \"VERSION_VALUE=!VERSION_VALUE:\"=!\"");
    });

    windowsCmdTest(
        "downloads the latest binary and removes the temporary executable when install is skipped",
        async () => {
            const rootDirectory = await createTemporaryDirectory("oo-install-cmd");
            const binDirectory = win32.join(rootDirectory, "bin");
            const downloadDirectory = win32.join(rootDirectory, "downloads");
            const downloadedBinaryPath = win32.join(downloadDirectory, "oo-1.2.3-win32-x64.exe");
            const latestJsonUrl = "https://example.test/release/apps/oo-cli/latest.json";
            const binaryUrl = "https://example.test/release/apps/oo-cli/1.2.3/win32-x64/oo.exe";

            trackDirectory(rootDirectory);
            await mkdir(binDirectory, { recursive: true });
            await writeFile(
                win32.join(binDirectory, "curl.cmd"),
                [
                    "@echo off",
                    "setlocal EnableExtensions",
                    "if \"%~1\"==\"--version\" exit /b 0",
                    "set \"URL=\"",
                    "set \"OUTPUT=\"",
                    ":parse_args",
                    "if \"%~1\"==\"\" goto handle_request",
                    "if \"%~1\"==\"-fsSL\" (",
                    "  shift",
                    "  goto parse_args",
                    ")",
                    "if \"%~1\"==\"-o\" (",
                    "  set \"OUTPUT=%~2\"",
                    "  shift",
                    "  shift",
                    "  goto parse_args",
                    ")",
                    "set \"URL=%~1\"",
                    "shift",
                    "goto parse_args",
                    ":handle_request",
                    `if /I "%URL%"=="${latestJsonUrl}" (`,
                    "  > \"%OUTPUT%\" echo({\"version\":\"1.2.3\"})",
                    "  exit /b 0",
                    ")",
                    `if /I "%URL%"=="${binaryUrl}" (`,
                    "  > \"%OUTPUT%\" echo stub",
                    "  exit /b 0",
                    ")",
                    ">&2 echo Unexpected URL: %URL%",
                    "exit /b 1",
                ].join("\r\n"),
                "utf8",
            );
            await chmod(win32.join(binDirectory, "curl.cmd"), 0o755);
            const commandPath = `${binDirectory};${process.env.Path ?? process.env.PATH ?? ""}`;

            const result = Bun.spawnSync(
                ["cmd.exe", "/d", "/c", toWindowsPath(installScriptPath)],
                {
                    env: {
                        ...process.env,
                        OO_INSTALL_DOWNLOAD_BASE_URL: "https://example.test/release/apps/oo-cli",
                        OO_INSTALL_DOWNLOAD_DIR: downloadDirectory,
                        OO_INSTALL_PLATFORM: "win32-x64",
                        OO_INSTALL_SKIP_RUN_INSTALL: "1",
                        PATH: commandPath,
                        Path: commandPath,
                    },
                    stderr: "pipe",
                    stdin: "ignore",
                    stdout: "pipe",
                },
            );

            expect(result.exitCode).toBe(0);
            expect(await Bun.file(downloadedBinaryPath).exists()).toBeFalse();
        },
    );
});

function toWindowsPath(path: string): string {
    return path.replaceAll("/", "\\");
}
