import { readFile, writeFile } from "node:fs/promises";
import { join, win32 } from "node:path";

import { beforeAll, describe, expect, test } from "bun:test";
import { createTemporaryDirectory, decodeSpawnOutput, useTemporaryDirectoryCleanup } from "../../__tests__/helpers.ts";

const installScriptPath = join(import.meta.dir, "install.ps1");
const powerShellCommand = resolvePowerShellCommand();
const windowsPowerShellTest = process.platform === "win32" && powerShellCommand !== undefined
    ? test
    : test.skip;
const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("install.ps1", () => {
    let scriptContent: string;

    beforeAll(async () => {
        scriptContent = await readFile(installScriptPath, "utf8");
    });

    test("declares the expected release URL and Windows executable suffix", () => {
        expect(scriptContent).toContain("https://static.oomol.com/release/apps/oo-cli");
        expect(scriptContent).toContain("latest.json");
        expect(scriptContent).toContain("oo.exe");
    });

    test("uses ApplicationData as the default Windows download root", () => {
        expect(scriptContent).toContain("SpecialFolder]::ApplicationData");
        expect(scriptContent).toContain("ChildPath \"oo\"");
        expect(scriptContent).toContain("ChildPath \"downloads\"");
    });

    test("supports environment overrides and the win32 platform ids", () => {
        expect(scriptContent).toContain("OO_INSTALL_DOWNLOAD_BASE_URL");
        expect(scriptContent).toContain("OO_INSTALL_DOWNLOAD_DIR");
        expect(scriptContent).toContain("OO_INSTALL_PLATFORM");
        expect(scriptContent).toContain("OO_INSTALL_SKIP_RUN_INSTALL");
        expect(scriptContent).toContain("win32-x64");
        expect(scriptContent).toContain("win32-arm64");
    });

    windowsPowerShellTest(
        "uses %APPDATA%\\oo\\downloads as the default Windows download directory",
        () => {
            const command = [
                `. '${escapePowerShellString(installScriptPath)}'`,
                "Resolve-DefaultDownloadDirectory",
            ].join("; ");
            const result = Bun.spawnSync(
                [
                    powerShellCommand!,
                    "-NoLogo",
                    "-NoProfile",
                    "-Command",
                    command,
                ],
                {
                    env: process.env,
                    stderr: "pipe",
                    stdin: "ignore",
                    stdout: "pipe",
                },
            );

            expect(result.exitCode).toBe(0);
            expect(decodeSpawnOutput(result.stdout).trim()).toBe(
                win32.join(
                    process.env.APPDATA
                    ?? win32.join(
                        process.env.USERPROFILE ?? "",
                        "AppData",
                        "Roaming",
                    ),
                    "oo",
                    "downloads",
                ),
            );
        },
    );

    windowsPowerShellTest(
        "downloads the latest binary and cleans up the temporary executable",
        async () => {
            const rootDirectory = await createTemporaryDirectory("oo-install-ps1");
            const downloadDirectory = win32.join(rootDirectory, "downloads");

            trackDirectory(rootDirectory);

            const command = [
                `$env:OO_INSTALL_DOWNLOAD_BASE_URL = '${escapePowerShellString("https://example.test/release/apps/oo-cli")}'`,
                `$env:OO_INSTALL_DOWNLOAD_DIR = '${escapePowerShellString(downloadDirectory)}'`,
                "$env:OO_INSTALL_PLATFORM = 'win32-x64'",
                "$env:OO_INSTALL_SKIP_RUN_INSTALL = '1'",
                "$global:RecordedRestUris = @()",
                "$global:RecordedWebRequestUri = ''",
                "function Invoke-RestMethod {",
                "    param([string]$Uri)",
                "    $global:RecordedRestUris += $Uri",
                "    return @{ version = '1.2.3' }",
                "}",
                "function Invoke-WebRequest {",
                "    param([string]$Uri, [string]$OutFile)",
                "    $global:RecordedWebRequestUri = $Uri",
                "    Set-Content -LiteralPath $OutFile -Value 'stub'",
                "}",
                `. '${escapePowerShellString(installScriptPath)}'`,
                "Main",
                "Write-Output ($global:RecordedRestUris -join '|')",
                "Write-Output $global:RecordedWebRequestUri",
                "Write-Output (Test-Path -LiteralPath (Join-Path $env:OO_INSTALL_DOWNLOAD_DIR 'oo-1.2.3-win32-x64.exe'))",
            ].join("; ");
            const result = Bun.spawnSync(
                [
                    powerShellCommand!,
                    "-NoLogo",
                    "-NoProfile",
                    "-Command",
                    command,
                ],
                {
                    env: process.env,
                    stderr: "pipe",
                    stdin: "ignore",
                    stdout: "pipe",
                },
            );

            expect(result.exitCode).toBe(0);

            const lines = decodeSpawnOutput(result.stdout)
                .split(/\r?\n/u)
                .map(line => line.trim())
                .filter(Boolean);

            expect(lines).toContain("https://example.test/release/apps/oo-cli/latest.json");
            expect(lines).toContain("https://example.test/release/apps/oo-cli/1.2.3/win32-x64/oo.exe");
            expect(lines.at(-1)).toBe("False");
        },
    );

    windowsPowerShellTest(
        "propagates the installer process exit code",
        async () => {
            const rootDirectory = await createTemporaryDirectory("oo-install-ps1-exit");
            const stubInstallerPath = win32.join(rootDirectory, "stub-installer.cmd");

            trackDirectory(rootDirectory);
            await writeFile(
                stubInstallerPath,
                [
                    "@echo off",
                    "exit /b 7",
                ].join("\r\n"),
                "utf8",
            );

            const command = [
                `. '${escapePowerShellString(installScriptPath)}'`,
                `Invoke-InstallCommand -BinaryPath '${escapePowerShellString(stubInstallerPath)}'`,
                "exit $LASTEXITCODE",
            ].join("; ");
            const result = Bun.spawnSync(
                [
                    powerShellCommand!,
                    "-NoLogo",
                    "-NoProfile",
                    "-Command",
                    command,
                ],
                {
                    env: process.env,
                    stderr: "pipe",
                    stdin: "ignore",
                    stdout: "pipe",
                },
            );

            expect(result.exitCode).toBe(7);
        },
    );
});

function resolvePowerShellCommand(): string | undefined {
    const candidates = process.platform === "win32"
        ? ["pwsh", "powershell"]
        : ["pwsh"];

    for (const candidate of candidates) {
        try {
            const result = Bun.spawnSync(
                [
                    candidate,
                    "-NoLogo",
                    "-NoProfile",
                    "-Command",
                    "$PSVersionTable.PSVersion.ToString()",
                ],
                {
                    env: process.env,
                    stderr: "pipe",
                    stdin: "ignore",
                    stdout: "pipe",
                },
            );

            if (result.exitCode === 0) {
                return candidate;
            }
        }
        catch {}
    }

    return undefined;
}

function escapePowerShellString(value: string): string {
    return value.replaceAll("'", "''");
}
