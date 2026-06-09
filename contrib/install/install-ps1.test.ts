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

    test("detects architecture from processor environment variables", () => {
        expect(scriptContent).toContain("PROCESSOR_ARCHITEW6432");
        expect(scriptContent).toContain("PROCESSOR_ARCHITECTURE");
        // RuntimeInformation's OSArchitecture is missing on the shadowed type in
        // Windows PowerShell 5.1 and throws under Set-StrictMode, so the script must
        // not depend on it for architecture detection.
        expect(scriptContent).not.toContain("OSArchitecture");
    });

    test("maps every shipped Windows architecture token to a platform id", () => {
        expect(scriptContent).toContain("\"arm64\"");
        // AMD64 is the only token PROCESSOR_ARCHITECTURE reports on x64 Windows, so
        // the amd64 case is load-bearing; without it every x64 host would fall through
        // to the default branch and fail.
        expect(scriptContent).toContain("\"amd64\"");
        expect(scriptContent).toContain("\"x64\"");
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
                [
                    "function Invoke-RestMethod {",
                    "    param([string]$Uri)",
                    "    $global:RecordedRestUris += $Uri",
                    "    return @{ version = '1.2.3' }",
                    "}",
                ].join("\n"),
                [
                    "function Invoke-WebRequest {",
                    "    param([string]$Uri, [string]$OutFile)",
                    "    $global:RecordedWebRequestUri = $Uri",
                    "    Set-Content -LiteralPath $OutFile -Value 'stub'",
                    "}",
                ].join("\n"),
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

    const resolvePlatformCases = [
        { architew6432: "", processor: "AMD64", expected: "win32-x64" },
        // Inbox Windows PowerShell 5.1 on an ARM64 host runs as a 32-bit (WOW64)
        // process, so PROCESSOR_ARCHITECTURE is x86 but PROCESSOR_ARCHITEW6432 carries
        // the true host architecture; the platform must still resolve to arm64.
        { architew6432: "ARM64", processor: "x86", expected: "win32-arm64" },
        { architew6432: "", processor: "ARM64", expected: "win32-arm64" },
    ];

    for (const { architew6432, processor, expected } of resolvePlatformCases) {
        windowsPowerShellTest(
            `Resolve-Platform maps ARCHITEW6432='${architew6432}' ARCHITECTURE='${processor}' to ${expected}`,
            () => {
                const result = runPowerShellCommand(
                    [
                        `$env:PROCESSOR_ARCHITEW6432 = '${escapePowerShellString(architew6432)}'`,
                        `$env:PROCESSOR_ARCHITECTURE = '${escapePowerShellString(processor)}'`,
                        `. '${escapePowerShellString(installScriptPath)}'`,
                        "Resolve-Platform",
                    ].join("; "),
                );

                expect(result.exitCode).toBe(0);
                expect(decodeSpawnOutput(result.stdout).trim()).toBe(expected);
            },
        );
    }

    windowsPowerShellTest(
        "Resolve-Platform fails on an unsupported architecture",
        () => {
            const result = runPowerShellCommand(
                [
                    "$env:PROCESSOR_ARCHITEW6432 = ''",
                    "$env:PROCESSOR_ARCHITECTURE = 'x86'",
                    `. '${escapePowerShellString(installScriptPath)}'`,
                    "Resolve-Platform",
                ].join("; "),
            );

            expect(result.exitCode).not.toBe(0);
            expect(decodeSpawnOutput(result.stderr)).toContain("Unsupported Windows architecture");
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

function runPowerShellCommand(command: string) {
    return Bun.spawnSync(
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
}
