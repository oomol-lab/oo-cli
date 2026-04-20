import type { CliRunResult } from "../../__tests__/helpers.ts";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory, useTemporaryDirectoryCleanup } from "../../__tests__/helpers.ts";

const installScriptPath = join(import.meta.dir, "install.sh");
const { track: trackDirectory } = useTemporaryDirectoryCleanup();
const unixInstallDescribe = process.platform === "win32" ? describe.skip : describe;

unixInstallDescribe("install.sh", () => {
    test("uses ~/.config/oo/downloads as the default Linux download directory", async () => {
        const result = await runBashCommand([
            "HOME='/Users/demo'",
            mockUname("Linux"),
            `source "${installScriptPath}"`,
            "resolve_default_download_dir",
        ].join("\n"));

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("/Users/demo/.config/oo/downloads");
    });

    test("uses ~/Library/Application Support/oo/downloads as the default Darwin download directory", async () => {
        const result = await runBashCommand([
            "HOME='/Users/demo'",
            mockUname("Darwin"),
            `source "${installScriptPath}"`,
            "resolve_default_download_dir",
        ].join("\n"));

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("/Users/demo/Library/Application Support/oo/downloads");
    });

    test("resolves a musl Linux target directory", async () => {
        const result = await runBashCommand([
            mockUname("Linux", "x86_64"),
            "ldd() {",
            "  printf 'musl libc\\n'",
            "}",
            `source "${installScriptPath}"`,
            "resolve_platform",
        ].join("\n"));

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("linux-x64-musl");
        expect(result.stderr).toBe("");
    });

    test("prefers arm64 when running under Rosetta on macOS", async () => {
        const result = await runBashCommand([
            mockUname("Darwin", "x86_64"),
            "sysctl() {",
            "  printf '1\\n'",
            "}",
            `source "${installScriptPath}"`,
            "resolve_platform",
        ].join("\n"));

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("darwin-arm64");
        expect(result.stderr).toBe("");
    });

    test("downloads the latest binary and runs install with forwarded arguments", async () => {
        const rootDirectory = await createInstallerSandbox();
        const downloadDirectory = join(rootDirectory, "downloads");
        const installLogPath = join(rootDirectory, "install.log");

        const result = await runInstaller(rootDirectory, {
            OO_INSTALL_DOWNLOAD_BASE_URL: "https://example.test/release/apps/oo-cli",
            OO_INSTALL_DOWNLOAD_DIR: downloadDirectory,
            OO_INSTALL_PLATFORM: "linux-x64-musl",
            TEST_BINARY_FIXTURE: join(rootDirectory, "fixtures", "oo"),
            TEST_INSTALL_LOG: installLogPath,
            TEST_LATEST_JSON: JSON.stringify({ version: "1.2.3" }),
        }, ["stable", "--force"]);

        expect(result.exitCode).toBe(0);
        expect(await readFile(installLogPath, "utf8")).toBe(
            "install stable --force\n",
        );
        expect(await readdir(downloadDirectory)).toEqual([]);
    });

    test("fails when latest.json does not include a version", async () => {
        const rootDirectory = await createInstallerSandbox();
        const downloadDirectory = join(rootDirectory, "downloads");

        const result = await runInstaller(rootDirectory, {
            OO_INSTALL_DOWNLOAD_BASE_URL: "https://example.test/release/apps/oo-cli",
            OO_INSTALL_DOWNLOAD_DIR: downloadDirectory,
            OO_INSTALL_PLATFORM: "linux-x64",
            TEST_BINARY_FIXTURE: join(rootDirectory, "fixtures", "oo"),
            TEST_LATEST_JSON: "{\"current\":\"1.2.3\"}",
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
            "Failed to read version from https://example.test/release/apps/oo-cli/latest.json",
        );
    });
});

async function createInstallerSandbox(): Promise<string> {
    const rootDirectory = await createTemporaryDirectory("oo-install-script");
    const binDirectory = join(rootDirectory, "bin");
    const fixturesDirectory = join(rootDirectory, "fixtures");

    trackDirectory(rootDirectory);
    await Promise.all([
        mkdir(binDirectory, { recursive: true }),
        mkdir(fixturesDirectory, { recursive: true }),
    ]);

    await Promise.all([
        writeExecutable(
            join(binDirectory, "curl"),
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "output_path=\"\"",
                "url=\"\"",
                "while [ \"$#\" -gt 0 ]; do",
                "  case \"$1\" in",
                "    -o)",
                "      output_path=\"$2\"",
                "      shift 2",
                "      ;;",
                "    -*)",
                "      shift",
                "      ;;",
                "    *)",
                "      url=\"$1\"",
                "      shift",
                "      ;;",
                "  esac",
                "done",
                "if [ -z \"$url\" ]; then",
                "  printf 'missing url\\n' >&2",
                "  exit 1",
                "fi",
                "case \"$url\" in",
                "  */latest.json)",
                "    if [ -n \"$output_path\" ]; then",
                "      printf '%s' \"$TEST_LATEST_JSON\" > \"$output_path\"",
                "    else",
                "      printf '%s' \"$TEST_LATEST_JSON\"",
                "    fi",
                "    ;;",
                "  */oo)",
                "    if [ -z \"$output_path\" ]; then",
                "      cat \"$TEST_BINARY_FIXTURE\"",
                "    else",
                "      cp \"$TEST_BINARY_FIXTURE\" \"$output_path\"",
                "    fi",
                "    ;;",
                "  *)",
                "    printf 'unexpected url: %s\\n' \"$url\" >&2",
                "    exit 1",
                "    ;;",
                "esac",
            ].join("\n"),
        ),
        writeExecutable(
            join(fixturesDirectory, "oo"),
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "printf '%s\\n' \"$*\" > \"$TEST_INSTALL_LOG\"",
            ].join("\n"),
        ),
    ]);

    return rootDirectory;
}

async function writeExecutable(path: string, content: string): Promise<void> {
    await writeFile(path, `${content}\n`, "utf8");
    await chmod(path, 0o755);
}

async function runInstaller(
    sandboxDirectory: string,
    env: Record<string, string>,
    args: string[] = [],
): Promise<CliRunResult> {
    return runCommand(
        ["bash", installScriptPath, ...args],
        sandboxDirectory,
        env,
    );
}

async function runBashCommand(script: string): Promise<CliRunResult> {
    return runCommand(
        ["bash", "-lc", script],
        import.meta.dir,
    );
}

async function runCommand(
    cmd: string[],
    cwd: string,
    env: Record<string, string> = {},
): Promise<CliRunResult> {
    const childProcess = Bun.spawn(cmd, {
        cwd,
        env: {
            ...process.env,
            ...env,
            PATH: buildPath(env.PATH, cwd),
        },
        stderr: "pipe",
        stdout: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
        readStream(childProcess.stdout),
        readStream(childProcess.stderr),
    ]);
    const exitCode = await childProcess.exited;

    return {
        exitCode,
        stderr,
        stdout,
    };
}

function buildPath(explicitPath: string | undefined, cwd: string): string {
    if (explicitPath !== undefined) {
        return explicitPath;
    }

    return `${join(cwd, "bin")}:${process.env.PATH ?? ""}`;
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
    if (stream === null) {
        return "";
    }

    return await new Response(stream).text();
}

function mockUname(os: string, arch?: string): string {
    const lines = [
        "uname() {",
        "  if [ \"$1\" = \"-s\" ]; then",
        `    printf '${os}\\n'`,
        "    return 0",
        "  fi",
    ];

    if (arch !== undefined) {
        lines.push(
            "  if [ \"$1\" = \"-m\" ]; then",
            `    printf '${arch}\\n'`,
            "    return 0",
            "  fi",
        );
    }

    lines.push(
        "  command uname \"$@\"",
        "}",
    );

    return lines.join("\n");
}
