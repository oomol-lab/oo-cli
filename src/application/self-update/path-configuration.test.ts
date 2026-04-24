import type { SelfUpdateCommandRunOptions } from "../contracts/self-update.ts";
import { mkdir, readFile } from "node:fs/promises";
import { posix, win32 } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import {
    ensureExecutableDirectoryOnPath,
    isExecutableDirectoryOnPath,
} from "./path-configuration.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("ensureExecutableDirectoryOnPath", () => {
    test("writes zsh profile PATH setup when the executable directory is missing from PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-zsh");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const zshrcPath = posix.join(homeDirectory, ".zshrc");
        const zshenvPath = posix.join(homeDirectory, ".zshenv");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "zsh" ? "/mock/bin/zsh" : null,
                },
            });

            expect(result).toEqual({
                status: "configured",
                target: [zshrcPath, zshenvPath],
            });
            const expectedSnippet = [
                "# Added by oo CLI",
                "case \":$PATH:\" in",
                "    *\":$HOME/.local/bin:\"*) ;;",
                "    *) export PATH=\"$HOME/.local/bin:$PATH\" ;;",
                "esac",
                "",
            ].join("\n");

            expect(await readFile(zshrcPath, "utf8")).toBe(expectedSnippet);
            expect(await readFile(zshenvPath, "utf8")).toBe(expectedSnippet);
        }
        finally {
            logCapture.close();
        }
    });

    test("writes the macOS zsh login profile and .zshenv", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-darwin-zsh");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const zprofilePath = posix.join(homeDirectory, ".zprofile");
        const zshenvPath = posix.join(homeDirectory, ".zshenv");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "darwin",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "darwin",
                    resolveCommandPath: commandName =>
                        commandName === "zsh" ? "/mock/bin/zsh" : null,
                },
            });

            expect(result.target).toEqual([zprofilePath, zshenvPath]);
            expect(await readFile(zprofilePath, "utf8")).toContain(
                "# Added by oo CLI\n",
            );
            expect(await readFile(zshenvPath, "utf8")).toContain(
                "# Added by oo CLI\n",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("writes every installed Unix shell profile", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-multi-shell");
        const homeDirectory = toPortablePath(rootDirectory);
        const configHomeDirectory = posix.join(homeDirectory, "xdg");
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const zshProfilePath = posix.join(homeDirectory, ".zshrc");
        const bashProfilePath = posix.join(homeDirectory, ".bashrc");
        const fishProfilePath = posix.join(configHomeDirectory, "fish", "conf.d", "oo.fish");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
            XDG_CONFIG_HOME: configHomeDirectory,
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        ["bash", "fish"].includes(commandName)
                            ? `/mock/bin/${commandName}`
                            : null,
                },
            });

            const zshenvPath = posix.join(homeDirectory, ".zshenv");
            const profilePath = posix.join(homeDirectory, ".profile");

            expect(result).toEqual({
                status: "configured",
                target: [
                    zshProfilePath,
                    zshenvPath,
                    bashProfilePath,
                    profilePath,
                    fishProfilePath,
                ],
            });
            await expect(Bun.file(zshProfilePath).exists()).resolves.toBeTrue();
            await expect(Bun.file(zshenvPath).exists()).resolves.toBeTrue();
            await expect(Bun.file(bashProfilePath).exists()).resolves.toBeTrue();
            await expect(Bun.file(profilePath).exists()).resolves.toBeTrue();
            await expect(Bun.file(fishProfilePath).exists()).resolves.toBeTrue();
        }
        finally {
            logCapture.close();
        }
    });

    test("writes fish config once when the executable directory is missing from PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-fish");
        const homeDirectory = toPortablePath(rootDirectory);
        const configHomeDirectory = posix.join(homeDirectory, "xdg");
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const profilePath = posix.join(configHomeDirectory, "fish", "conf.d", "oo.fish");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/usr/bin/fish",
            XDG_CONFIG_HOME: configHomeDirectory,
        };

        trackDirectory(rootDirectory);

        try {
            const firstResult = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "fish" ? "/mock/bin/fish" : null,
                },
            });
            const secondResult = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "fish" ? "/mock/bin/fish" : null,
                },
            });
            const profileContent = await readFile(profilePath, "utf8");

            expect(firstResult.status).toBe("configured");
            expect(secondResult).toEqual({
                status: "already-configured",
                target: [profilePath],
            });
            expect(countOccurrences(
                profileContent,
                `    fish_add_path "$HOME/.local/bin"`,
            )).toBe(1);
        }
        finally {
            logCapture.close();
        }
    });

    test("uses an existing bash profile before creating the platform-preferred fallback", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-bash");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const bashProfilePath = posix.join(homeDirectory, ".bash_profile");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/bash",
        };

        trackDirectory(rootDirectory);
        await Bun.write(bashProfilePath, "# existing bash profile\n");

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "bash" ? "/mock/bin/bash" : null,
                },
            });

            expect(result.target).toEqual([bashProfilePath]);
            expect(await readFile(bashProfilePath, "utf8")).toContain(
                "# existing bash profile\n# Added by oo CLI\n",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("bash writes every existing rc file so SSH login and interactive shells both get PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-bash-multi");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const bashrcPath = posix.join(homeDirectory, ".bashrc");
        const profilePath = posix.join(homeDirectory, ".profile");
        const bashProfilePath = posix.join(homeDirectory, ".bash_profile");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/bash",
        };

        trackDirectory(rootDirectory);
        await Bun.write(bashrcPath, "# existing bashrc\n");
        await Bun.write(profilePath, "# existing profile\n");

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "bash" ? "/mock/bin/bash" : null,
                },
            });

            expect(result.status).toBe("configured");
            expect(result.target).toEqual([bashrcPath, profilePath]);
            expect(await readFile(bashrcPath, "utf8")).toContain(
                "# existing bashrc\n# Added by oo CLI\n",
            );
            expect(await readFile(profilePath, "utf8")).toContain(
                "# existing profile\n# Added by oo CLI\n",
            );
            await expect(Bun.file(bashProfilePath).exists()).resolves.toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });

    test("fresh Linux bash fallback creates both .bashrc and .profile so login shells also load PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-bash-none");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const bashrcPath = posix.join(homeDirectory, ".bashrc");
        const bashProfilePath = posix.join(homeDirectory, ".bash_profile");
        const profilePath = posix.join(homeDirectory, ".profile");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/bash",
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "bash" ? "/mock/bin/bash" : null,
                },
            });

            // .bashrc covers interactive non-login; .profile covers SSH/login
            // bash when .bash_profile and .bash_login are absent.
            expect(result.target).toEqual([bashrcPath, profilePath]);
            await expect(Bun.file(bashrcPath).exists()).resolves.toBeTrue();
            await expect(Bun.file(profilePath).exists()).resolves.toBeTrue();
            await expect(Bun.file(bashProfilePath).exists()).resolves.toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });

    test("deduplicates the .profile fallback for unknown shells", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-unknown-shell");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const bashrcPath = posix.join(homeDirectory, ".bashrc");
        const profilePath = posix.join(homeDirectory, ".profile");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/usr/bin/xonsh",
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "bash" ? "/mock/bin/bash" : null,
                },
            });

            expect(result).toEqual({
                status: "configured",
                target: [bashrcPath, profilePath],
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("fresh macOS bash fallback creates both .bash_profile and .bashrc so nested bash also loads PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-darwin-bash");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const bashProfilePath = posix.join(homeDirectory, ".bash_profile");
        const bashrcPath = posix.join(homeDirectory, ".bashrc");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/bash",
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "darwin",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "darwin",
                    resolveCommandPath: commandName =>
                        commandName === "bash" ? "/mock/bin/bash" : null,
                },
            });

            // .bash_profile covers login (Terminal.app default); .bashrc
            // covers nested bash and `bash -c` invocations.
            expect(result.target).toEqual([bashProfilePath, bashrcPath]);
            expect(await readFile(bashProfilePath, "utf8")).toContain(
                "# Added by oo CLI\n",
            );
            expect(await readFile(bashrcPath, "utf8")).toContain(
                "# Added by oo CLI\n",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("writes a nushell config when nu is the current shell", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-nu");
        const homeDirectory = toPortablePath(rootDirectory);
        const configHomeDirectory = posix.join(homeDirectory, "xdg");
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const profilePath = posix.join(
            configHomeDirectory,
            "nushell",
            "config.nu",
        );
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/usr/bin/nu",
            XDG_CONFIG_HOME: configHomeDirectory,
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "nu" ? "/mock/bin/nu" : null,
                },
            });

            expect(result.target).toEqual([profilePath]);
            const profileContent = await readFile(profilePath, "utf8");

            expect(profileContent).toContain("# Added by oo CLI\n");
            expect(profileContent).toContain(`use std/util "path add"`);
            expect(profileContent).toContain(
                `path add ($env.HOME | path join ".local/bin")`,
            );
            expect(profileContent).not.toContain("prepend");
        }
        finally {
            logCapture.close();
        }
    });

    test("writes a PowerShell profile for pwsh on Unix platforms", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-pwsh");
        const homeDirectory = toPortablePath(rootDirectory);
        const configHomeDirectory = posix.join(homeDirectory, "xdg");
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const profilePath = posix.join(
            configHomeDirectory,
            "powershell",
            "Microsoft.PowerShell_profile.ps1",
        );
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/usr/bin/pwsh",
            XDG_CONFIG_HOME: configHomeDirectory,
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "pwsh" ? "/mock/bin/pwsh" : null,
                },
            });

            expect(result.target).toEqual([profilePath]);
            const profileContent = await readFile(profilePath, "utf8");

            expect(profileContent).toContain("Join-Path $HOME '.local/bin'");
            expect(profileContent).not.toContain("$ooCliBin");
            expect(profileContent).not.toContain("[string]::IsNullOrEmpty");
        }
        finally {
            logCapture.close();
        }
    });

    test("runs PowerShell to update the Windows user PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-win");
        const executableDirectory = win32.join(rootDirectory, ".local", "bin");
        const logCapture = createLogCapture();
        const commands: SelfUpdateCommandRunOptions[] = [];

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env: process.env,
                executableDirectory,
                platform: "win32",
                runtime: {
                    allowWindowsRegistryWrite: true,
                    env: process.env,
                    logger: logCapture.logger,
                    platform: "win32",
                    resolveCommandPath: commandName =>
                        commandName === "powershell.exe"
                            ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
                            : null,
                    runCommand: async (options) => {
                        commands.push(options);

                        return {
                            exitCode: 0,
                            signalCode: null,
                            stderr: "",
                            stdout: "",
                        };
                    },
                },
            });

            expect(result).toEqual({
                status: "configured",
                target: ["Windows user PATH"],
            });
            expect(commands).toHaveLength(1);
            expect(commands[0]!.env.OO_SELF_UPDATE_PATH_ENTRY).toBe(executableDirectory);
            expect(commands[0]!.commandArguments).toContain("-NoProfile");
            const commandText = commands[0]!.commandArguments.join("\n");

            expect(commandText).toContain(
                "[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)",
            );
            expect(commandText).toContain("$key.SetValue('Path', $next, $kind)");
            expect(commandText).toContain(
                "[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames",
            );
            expect(commandText).toContain("SendMessageTimeout");
            expect(commandText).toContain("'Environment'");
            expect(commandText).not.toContain(
                "[Environment]::SetEnvironmentVariable('Path'",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("returns partial-configured when some profiles succeed and others fail", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-partial");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const zshrcPath = posix.join(homeDirectory, ".zshrc");
        const zshenvPath = posix.join(homeDirectory, ".zshenv");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
        };

        trackDirectory(rootDirectory);
        // Put a directory where .zshenv would be written so writeFile errors
        // with EISDIR while .zshrc still succeeds.
        await mkdir(zshenvPath, { recursive: true });

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "zsh" ? "/mock/bin/zsh" : null,
                },
            });

            expect(result).toEqual({
                status: "partial-configured",
                target: [zshrcPath],
                failedTargets: [zshenvPath],
            });
            await expect(Bun.file(zshrcPath).exists()).resolves.toBeTrue();
        }
        finally {
            logCapture.close();
        }
    });

    test("returns failed with failedTargets when every write fails", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-all-failed");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const zshrcPath = posix.join(homeDirectory, ".zshrc");
        const zshenvPath = posix.join(homeDirectory, ".zshenv");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
        };

        trackDirectory(rootDirectory);
        await mkdir(zshrcPath, { recursive: true });
        await mkdir(zshenvPath, { recursive: true });

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "zsh" ? "/mock/bin/zsh" : null,
                },
            });

            expect(result.status).toBe("failed");
            expect(result.failedTargets).toEqual([zshrcPath, zshenvPath]);
        }
        finally {
            logCapture.close();
        }
    });

    test("returns skipped without writing when modifyPath is false", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-skipped");
        const homeDirectory = toPortablePath(rootDirectory);
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const profilePath = posix.join(homeDirectory, ".zshrc");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: "/usr/bin",
            SHELL: "/bin/zsh",
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                modifyPath: false,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                    resolveCommandPath: commandName =>
                        commandName === "zsh" ? "/mock/bin/zsh" : null,
                },
            });

            expect(result).toEqual({
                status: "skipped",
            });
            await expect(Bun.file(profilePath).exists()).resolves.toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });

    test("returns already-configured even when modifyPath is false but the directory is present", async () => {
        const homeDirectory = "/home/demo";
        const executableDirectory = posix.join(homeDirectory, ".local", "bin");
        const logCapture = createLogCapture();
        const env = {
            HOME: homeDirectory,
            PATH: `/usr/bin:${executableDirectory}`,
            SHELL: "/bin/zsh",
        };

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                modifyPath: false,
                platform: "linux",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "linux",
                },
            });

            expect(result).toEqual({
                status: "already-configured",
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("skips Windows registry write when allowWindowsRegistryWrite is not set", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-path-win-no-flag");
        const executableDirectory = win32.join(rootDirectory, ".local", "bin");
        const logCapture = createLogCapture();
        const env = {
            Path: "C:\\Windows\\System32",
            USERPROFILE: rootDirectory,
        };

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env,
                executableDirectory,
                platform: "win32",
                runtime: {
                    env,
                    logger: logCapture.logger,
                    platform: "win32",
                    runCommand: async () => {
                        throw new Error("Windows user PATH command should not run");
                    },
                },
            });

            expect(result).toEqual({
                status: "failed",
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("runs the Windows registry write even when env is a cloned (non-identity) object", async () => {
        // Regression for the old `options.env !== process.env` guard: a caller
        // that innocently clones env (e.g. `{ ...process.env, DEBUG: "1" }`)
        // must still be able to write the registry when explicitly allowed.
        const rootDirectory = await createTemporaryDirectory("oo-path-win-cloned-env");
        const executableDirectory = win32.join(rootDirectory, ".local", "bin");
        const logCapture = createLogCapture();
        const clonedEnv = { ...process.env };
        const commands: SelfUpdateCommandRunOptions[] = [];

        trackDirectory(rootDirectory);

        try {
            const result = await ensureExecutableDirectoryOnPath({
                env: clonedEnv,
                executableDirectory,
                platform: "win32",
                runtime: {
                    allowWindowsRegistryWrite: true,
                    env: clonedEnv,
                    logger: logCapture.logger,
                    platform: "win32",
                    resolveCommandPath: commandName =>
                        commandName === "powershell.exe"
                            ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
                            : null,
                    runCommand: async (runOptions) => {
                        commands.push(runOptions);
                        return {
                            exitCode: 0,
                            signalCode: null,
                            stderr: "",
                            stdout: "",
                        };
                    },
                },
            });

            expect(clonedEnv).not.toBe(process.env);
            expect(result.status).toBe("configured");
            expect(commands).toHaveLength(1);
            expect(commands[0]!.env.OO_SELF_UPDATE_PATH_ENTRY).toBe(executableDirectory);
        }
        finally {
            logCapture.close();
        }
    });
});

describe("isExecutableDirectoryOnPath", () => {
    test("checks Windows Path case-insensitively", () => {
        expect(isExecutableDirectoryOnPath(
            "C:\\Users\\Demo\\.local\\bin",
            {
                Path: "C:\\WINDOWS\\System32;C:\\USERS\\DEMO\\.LOCAL\\BIN",
            },
            "win32",
        )).toBeTrue();
    });

    test("ignores trailing separators on POSIX PATH entries", () => {
        expect(isExecutableDirectoryOnPath(
            "/home/demo/.local/bin",
            {
                PATH: "/usr/bin:/home/demo/.local/bin/",
            },
            "linux",
        )).toBeTrue();
    });

    test("ignores trailing separators on Windows Path entries with either slash", () => {
        expect(isExecutableDirectoryOnPath(
            "C:\\Users\\Demo\\.local\\bin",
            {
                Path: "C:\\WINDOWS\\System32;C:\\Users\\Demo\\.local\\bin\\",
            },
            "win32",
        )).toBeTrue();
        expect(isExecutableDirectoryOnPath(
            "C:\\Users\\Demo\\.local\\bin",
            {
                Path: "C:\\WINDOWS\\System32;C:/Users/Demo/.local/bin/",
            },
            "win32",
        )).toBeTrue();
    });
});

function countOccurrences(value: string, searchValue: string): number {
    return value.split(searchValue).length - 1;
}

function toPortablePath(path: string): string {
    return path.replaceAll("\\", "/");
}
