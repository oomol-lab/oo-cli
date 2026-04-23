import type { Logger } from "pino";
import type {
    SelfUpdatePathConfigurationOptions,
    SelfUpdatePathConfigurationResult,
    SelfUpdateRuntimeOverrides,
} from "../contracts/self-update.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { resolveHomeDirectory } from "../path/home-directory.ts";
import { isFileMissingError } from "../shared/fs-errors.ts";
import {
    normalizeLoggedCommandOutput,
    runSelfUpdateCommand,
} from "./command-runner.ts";
import { readPathModule } from "./paths.ts";

interface PathConfigurationRuntime extends SelfUpdateRuntimeOverrides {
    env: Record<string, string | undefined>;
    logger: Logger;
    platform: NodeJS.Platform;
}

interface EnsureExecutableDirectoryOnPathOptions extends SelfUpdatePathConfigurationOptions {
    runtime: PathConfigurationRuntime;
}

interface ShellProfileConfiguration {
    content: string;
    profileDirectory: string;
    profilePath: string;
    snippet: string;
}

interface ShellProfileCandidate extends ShellProfileConfiguration {
    installed: boolean;
    profileExists: boolean;
    shellNames: readonly string[];
}

const pathConfigurationMarker = "Added by oo CLI";
const pathConfigurationSentinel = `# ${pathConfigurationMarker}`;
const defaultUnixPathExpression = "$HOME/.local/bin";
const windowsPathConfigurationTimeoutMs = 10_000;
const windowsPathEntryEnvName = "OO_SELF_UPDATE_PATH_ENTRY";

const zshShellNames = ["zsh"] as const;
const bashShellNames = ["bash"] as const;
const fishShellNames = ["fish"] as const;
const powerShellShellNames = ["pwsh", "powershell"] as const;
const nuShellNames = ["nu"] as const;
const knownUnixShellNames = new Set<string>([
    ...zshShellNames,
    ...bashShellNames,
    ...fishShellNames,
    ...powerShellShellNames,
    ...nuShellNames,
]);

export async function ensureExecutableDirectoryOnPath(
    options: EnsureExecutableDirectoryOnPathOptions,
): Promise<SelfUpdatePathConfigurationResult> {
    if (isExecutableDirectoryOnPath(
        options.executableDirectory,
        options.env,
        options.platform,
    )) {
        return {
            status: "already-configured",
        };
    }

    if (options.modifyPath === false) {
        return {
            status: "skipped",
        };
    }

    const overriddenResult = await options.runtime.configurePath?.({
        env: options.env,
        executableDirectory: options.executableDirectory,
        modifyPath: options.modifyPath,
        platform: options.platform,
    });

    if (overriddenResult !== undefined) {
        return overriddenResult;
    }

    return options.platform === "win32"
        ? await configureWindowsUserPath(options)
        : await configureUnixShellProfile(options);
}

export function isExecutableDirectoryOnPath(
    executableDirectory: string,
    env: Record<string, string | undefined>,
    platform: NodeJS.Platform,
): boolean {
    const pathValue = platform === "win32"
        ? env.Path ?? env.PATH
        : env.PATH;

    if (pathValue === undefined || pathValue.trim() === "") {
        return false;
    }

    const normalizedExecutableDirectory = normalizePathForComparison(
        executableDirectory,
        platform,
    );

    return pathValue
        .split(readPathModule(platform).delimiter)
        .some(segment =>
            normalizePathForComparison(segment, platform)
            === normalizedExecutableDirectory,
        );
}

async function configureUnixShellProfile(
    options: EnsureExecutableDirectoryOnPathOptions,
): Promise<SelfUpdatePathConfigurationResult> {
    try {
        const configurations = await resolveShellProfileConfigurations(options);
        const alreadyConfiguredTargets: string[] = [];
        const configuredTargets: string[] = [];

        for (const configuration of configurations) {
            if (configuration.content.includes(pathConfigurationSentinel)) {
                alreadyConfiguredTargets.push(configuration.profilePath);
                continue;
            }

            try {
                await writeShellProfileConfiguration(configuration);
                configuredTargets.push(configuration.profilePath);
                options.runtime.logger.info(
                    {
                        executableDirectory: options.executableDirectory,
                        profilePath: configuration.profilePath,
                    },
                    "CLI executable directory was added to the shell profile PATH.",
                );
            }
            catch (error) {
                options.runtime.logger.warn(
                    {
                        err: error,
                        executableDirectory: options.executableDirectory,
                        profilePath: configuration.profilePath,
                    },
                    "CLI executable directory shell profile PATH configuration failed.",
                );
            }
        }

        if (configuredTargets.length > 0) {
            return {
                status: "configured",
                target: configuredTargets,
            };
        }

        if (alreadyConfiguredTargets.length > 0) {
            return {
                status: "already-configured",
                target: alreadyConfiguredTargets,
            };
        }

        return {
            status: "failed",
        };
    }
    catch (error) {
        options.runtime.logger.warn(
            {
                err: error,
                executableDirectory: options.executableDirectory,
            },
            "CLI executable directory shell profile PATH configuration failed.",
        );

        return {
            status: "failed",
        };
    }
}

async function resolveShellProfileConfigurations(
    options: EnsureExecutableDirectoryOnPathOptions,
): Promise<ShellProfileConfiguration[]> {
    const homeDirectory = resolveHomeDirectory(options.env);
    const pathModule = readPathModule(options.platform);
    const xdgConfigHome = options.env.XDG_CONFIG_HOME
        ?? pathModule.join(homeDirectory, ".config");
    const shellName = readShellName(options.env.SHELL);
    const zshDirectory = options.env.ZDOTDIR ?? homeDirectory;
    const [zshCandidates, bashCandidates, fishCandidate, powerShellCandidate]
        = await Promise.all([
            // Cover both the conventional interactive profile and .zshenv —
            // .zshenv is read by every zsh invocation (login/non-login,
            // scripts, SSH) so it catches startup paths that .zshrc/.zprofile
            // miss. Runtime PATH guard keeps the two writes idempotent.
            Promise.all([
                createShellProfileCandidate(
                    {
                        profilePath: pathModule.join(
                            zshDirectory,
                            options.platform === "darwin" ? ".zprofile" : ".zshrc",
                        ),
                        shellNames: zshShellNames,
                        snippet: createPosixPathSnippet(),
                    },
                    options,
                ),
                createShellProfileCandidate(
                    {
                        profilePath: pathModule.join(zshDirectory, ".zshenv"),
                        shellNames: zshShellNames,
                        snippet: createPosixPathSnippet(),
                    },
                    options,
                ),
            ]),
            createBashProfileCandidates(homeDirectory, options),
            createShellProfileCandidate(
                {
                    // Write to a dedicated conf.d/ file so we never touch the
                    // user's main config.fish. fish auto-sources everything in
                    // conf.d/, matching the plugin convention used by rustup.
                    profilePath: pathModule.join(
                        xdgConfigHome,
                        "fish",
                        "conf.d",
                        "oo.fish",
                    ),
                    shellNames: fishShellNames,
                    snippet: createFishPathSnippet(),
                },
                options,
            ),
            createShellProfileCandidate(
                {
                    profilePath: pathModule.join(
                        xdgConfigHome,
                        "powershell",
                        "Microsoft.PowerShell_profile.ps1",
                    ),
                    shellNames: powerShellShellNames,
                    snippet: createPowerShellProfilePathSnippet(),
                },
                options,
            ),
        ]);
    const nushellCandidate = await createShellProfileCandidate(
        {
            profilePath: pathModule.join(
                xdgConfigHome,
                "nushell",
                "config.nu",
            ),
            shellNames: nuShellNames,
            snippet: createNushellPathSnippet(),
        },
        options,
    );
    const candidates = [
        ...zshCandidates,
        ...bashCandidates,
        fishCandidate,
        powerShellCandidate,
        nushellCandidate,
    ];
    const selectedConfigurations = candidates
        .filter(candidate => shouldConfigureShellProfile(candidate, shellName))
        .map(({ installed, profileExists, shellNames, ...configuration }) =>
            configuration,
        );

    if (selectedConfigurations.length === 0) {
        return [
            await createShellProfileConfiguration(
                pathModule.join(homeDirectory, ".profile"),
                options.platform,
                createPosixPathSnippet(),
            ),
        ];
    }

    if (shellName === undefined || knownUnixShellNames.has(shellName)) {
        return selectedConfigurations;
    }

    return [
        ...selectedConfigurations,
        await createShellProfileConfiguration(
            pathModule.join(homeDirectory, ".profile"),
            options.platform,
            createPosixPathSnippet(),
        ),
    ];
}

async function createBashProfileCandidates(
    homeDirectory: string,
    options: EnsureExecutableDirectoryOnPathOptions,
): Promise<ShellProfileCandidate[]> {
    // bash reads different files for login vs. non-login shells, and a single
    // machine routinely starts bash both ways (terminal emulator vs. SSH).
    // Writing to every rc file that exists matches what rustup/bun do — the
    // runtime duplicate guard in the snippet keeps PATH clean.
    const pathModule = readPathModule(options.platform);
    const profileNames = options.platform === "darwin"
        ? [".bash_profile", ".bashrc", ".profile"]
        : [".bashrc", ".bash_profile", ".profile"];
    const [installed, ...contents] = await Promise.all([
        isShellCommandAvailable("bash", options.runtime),
        ...profileNames.map(name =>
            readTextFileIfExists(pathModule.join(homeDirectory, name)),
        ),
    ]);
    const existing: ShellProfileCandidate[] = [];

    for (const [index, profileName] of profileNames.entries()) {
        const content = contents[index];

        if (content === undefined) {
            continue;
        }

        const profilePath = pathModule.join(homeDirectory, profileName);

        existing.push({
            content,
            installed,
            profileDirectory: pathModule.dirname(profilePath),
            profileExists: true,
            profilePath,
            shellNames: bashShellNames,
            snippet: createPosixPathSnippet(),
        });
    }

    if (existing.length > 0) {
        return existing;
    }

    // No bash rc file exists — create a pair that together covers both
    // login and non-login bash. Without this, a fresh container that only
    // gets .bashrc would miss SSH login shells (which read .bash_profile /
    // .bash_login / .profile instead).
    //   Linux: .bashrc (non-login) + .profile (login fallback)
    //   macOS: .bash_profile (login, Terminal default) + .bashrc (nested)
    const fallbackNames = options.platform === "darwin"
        ? [".bash_profile", ".bashrc"]
        : [".bashrc", ".profile"];

    return fallbackNames.map((profileName) => {
        const profilePath = pathModule.join(homeDirectory, profileName);

        return {
            content: "",
            installed,
            profileDirectory: pathModule.dirname(profilePath),
            profileExists: false,
            profilePath,
            shellNames: bashShellNames,
            snippet: createPosixPathSnippet(),
        };
    });
}

async function createShellProfileCandidate(
    options: {
        profilePath: string;
        shellNames: readonly string[];
        snippet: string;
    },
    runtimeOptions: EnsureExecutableDirectoryOnPathOptions,
): Promise<ShellProfileCandidate> {
    const pathModule = readPathModule(runtimeOptions.platform);
    const content = await readTextFileIfExists(options.profilePath);
    const installedResults = await Promise.all(
        options.shellNames.map(shellName =>
            isShellCommandAvailable(shellName, runtimeOptions.runtime),
        ),
    );

    return {
        content: content ?? "",
        installed: installedResults.some(Boolean),
        profileDirectory: pathModule.dirname(options.profilePath),
        profileExists: content !== undefined,
        profilePath: options.profilePath,
        shellNames: options.shellNames,
        snippet: options.snippet,
    };
}

function shouldConfigureShellProfile(
    candidate: ShellProfileCandidate,
    currentShellName: string | undefined,
): boolean {
    return candidate.installed
        || candidate.profileExists
        || (
            currentShellName !== undefined
            && candidate.shellNames.includes(currentShellName)
        );
}

async function createShellProfileConfiguration(
    profilePath: string,
    platform: NodeJS.Platform,
    snippet: string,
): Promise<ShellProfileConfiguration> {
    const pathModule = readPathModule(platform);

    return {
        content: await readTextFileIfExists(profilePath) ?? "",
        profileDirectory: pathModule.dirname(profilePath),
        profilePath,
        snippet,
    };
}

async function writeShellProfileConfiguration(
    configuration: ShellProfileConfiguration,
): Promise<void> {
    const separator = configuration.content === ""
        || configuration.content.endsWith("\n")
        ? ""
        : "\n";

    await mkdir(configuration.profileDirectory, {
        recursive: true,
    });
    await writeFile(
        configuration.profilePath,
        `${configuration.content}${separator}${configuration.snippet}`,
    );
}

function createPosixPathSnippet(): string {
    return [
        pathConfigurationSentinel,
        `case ":$PATH:" in`,
        `    *":${defaultUnixPathExpression}:"*) ;;`,
        `    *) export PATH="${defaultUnixPathExpression}:$PATH" ;;`,
        "esac",
        "",
    ].join("\n");
}

function createFishPathSnippet(): string {
    return [
        pathConfigurationSentinel,
        "if type -q fish_add_path",
        `    fish_add_path "${defaultUnixPathExpression}"`,
        `else if not contains "${defaultUnixPathExpression}" $PATH`,
        `    set -gx PATH "${defaultUnixPathExpression}" $PATH`,
        "end",
        "",
    ].join("\n");
}

function createPowerShellProfilePathSnippet(): string {
    return [
        pathConfigurationSentinel,
        `if (-not ($env:Path.Split([System.IO.Path]::PathSeparator) -contains (Join-Path $HOME '.local/bin'))) {`,
        `    $env:Path = (Join-Path $HOME '.local/bin') + [System.IO.Path]::PathSeparator + $env:Path`,
        "}",
        "",
    ].join("\n");
}

function createNushellPathSnippet(): string {
    // `path add` from nushell's stdlib handles the list-vs-string PATH
    // representation, deduping, and platform separators for us. Requires
    // nushell 0.87+ (September 2023) — the same baseline rustup targets.
    return [
        pathConfigurationSentinel,
        `use std/util "path add"`,
        `path add ($env.HOME | path join ".local/bin")`,
        "",
    ].join("\n");
}

async function configureWindowsUserPath(
    options: EnsureExecutableDirectoryOnPathOptions,
): Promise<SelfUpdatePathConfigurationResult> {
    if (options.env !== process.env) {
        options.runtime.logger.debug(
            {
                executableDirectory: options.executableDirectory,
            },
            "Windows user PATH configuration skipped for a non-process environment.",
        );

        return {
            status: "failed",
        };
    }

    const commandPath = resolvePowerShellCommandPath(options.runtime);

    if (commandPath === null) {
        options.runtime.logger.warn(
            {
                executableDirectory: options.executableDirectory,
            },
            "Windows user PATH configuration skipped because PowerShell was not found.",
        );

        return {
            status: "failed",
        };
    }

    try {
        const result = await (options.runtime.runCommand ?? runSelfUpdateCommand)({
            commandArguments: [
                "-NoLogo",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                createWindowsUserPathScript(),
            ],
            commandPath,
            env: {
                ...options.env,
                [windowsPathEntryEnvName]: options.executableDirectory,
            },
            timeoutMs: windowsPathConfigurationTimeoutMs,
        });

        if (result.exitCode !== 0 || result.signalCode !== null) {
            options.runtime.logger.warn(
                {
                    commandPath,
                    executableDirectory: options.executableDirectory,
                    exitCode: result.exitCode,
                    signalCode: result.signalCode,
                    stderr: normalizeLoggedCommandOutput(result.stderr),
                    stdout: normalizeLoggedCommandOutput(result.stdout),
                },
                "Windows user PATH configuration command failed.",
            );

            return {
                status: "failed",
            };
        }

        options.runtime.logger.info(
            {
                commandPath,
                executableDirectory: options.executableDirectory,
            },
            "CLI executable directory was added to the Windows user PATH.",
        );

        return {
            status: "configured",
            target: ["Windows user PATH"],
        };
    }
    catch (error) {
        options.runtime.logger.warn(
            {
                commandPath,
                err: error,
                executableDirectory: options.executableDirectory,
            },
            "Windows user PATH configuration failed.",
        );

        return {
            status: "failed",
        };
    }
}

function resolvePowerShellCommandPath(
    runtime: PathConfigurationRuntime,
): string | null {
    for (const commandName of ["powershell.exe", "powershell", "pwsh.exe", "pwsh"]) {
        const commandPath = runtime.resolveCommandPath?.(commandName)
            ?? Bun.which(commandName);

        if (commandPath !== null) {
            return commandPath;
        }
    }

    return null;
}

function createWindowsUserPathScript(): string {
    return [
        "$ErrorActionPreference = 'Stop'",
        `$bin = [Environment]::GetEnvironmentVariable('${windowsPathEntryEnvName}', 'Process')`,
        "if ([string]::IsNullOrWhiteSpace($bin)) { throw 'Missing PATH entry.' }",
        "$sep = [System.IO.Path]::PathSeparator",
        // Writing via the registry directly preserves the REG_EXPAND_SZ kind so
        // pre-existing %VAR% references in Path keep expanding for other apps.
        "$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)",
        "if ($null -eq $key) { $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment') }",
        "$changed = $false",
        "try {",
        "    $hasValue = $null -ne $key.GetValue('Path', $null)",
        "    if ($hasValue) {",
        "        $current = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
        "        $kind = $key.GetValueKind('Path')",
        "    }",
        "    else {",
        "        $current = ''",
        "        $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString",
        "    }",
        "    $trimmedBin = $bin.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)",
        "    $alreadyPresent = $false",
        "    if ($hasValue -and -not [string]::IsNullOrEmpty($current)) {",
        "        foreach ($entry in $current.Split($sep)) {",
        "            $expandedEntry = [Environment]::ExpandEnvironmentVariables($entry.Trim())",
        "            $trimmedEntry = $expandedEntry.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)",
        "            if ([string]::Equals($trimmedEntry, $trimmedBin, [System.StringComparison]::OrdinalIgnoreCase)) {",
        "                $alreadyPresent = $true",
        "                break",
        "            }",
        "        }",
        "    }",
        "    if (-not $alreadyPresent) {",
        "        if ([string]::IsNullOrEmpty($current)) { $next = $bin } else { $next = \"$bin$sep$current\" }",
        "        $key.SetValue('Path', $next, $kind)",
        "        $changed = $true",
        "    }",
        "}",
        "finally {",
        "    $key.Close()",
        "}",
        // Broadcast WM_SETTINGCHANGE so already-running processes (Explorer,
        // other shells) pick up the Path change without requiring logoff.
        "if ($changed) {",
        "    Add-Type -Namespace OoCliNative -Name User32 -MemberDefinition @'",
        "[System.Runtime.InteropServices.DllImport(\"user32.dll\", CharSet = System.Runtime.InteropServices.CharSet.Auto, SetLastError = true)]",
        "public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.IntPtr lpdwResult);",
        "'@",
        "    $broadcastResult = [System.IntPtr]::Zero",
        "    [OoCliNative.User32]::SendMessageTimeout([System.IntPtr]0xFFFF, 0x001A, [System.IntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$broadcastResult) | Out-Null",
        "}",
    ].join("\n");
}

async function isShellCommandAvailable(
    shellName: string,
    runtime: PathConfigurationRuntime,
): Promise<boolean> {
    if (runtime.resolveCommandPath !== undefined) {
        return runtime.resolveCommandPath(shellName) !== null;
    }

    return Bun.which(shellName) !== null;
}

function readShellName(rawShell: string | undefined): string | undefined {
    if (rawShell === undefined || rawShell.trim() === "") {
        return undefined;
    }

    const shellSegments = rawShell
        .trim()
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean);
    let shellName = shellSegments.at(-1)?.toLowerCase();

    if (shellName === undefined) {
        return undefined;
    }

    while (shellName.startsWith("-")) {
        shellName = shellName.slice(1);
    }

    return shellName.endsWith(".exe")
        ? shellName.slice(0, -4)
        : shellName;
}

function normalizePathForComparison(
    value: string,
    platform: NodeJS.Platform,
): string {
    const pathModule = readPathModule(platform);
    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        return "";
    }

    let resolvedValue = pathModule.normalize(
        pathModule.isAbsolute(trimmedValue)
            ? trimmedValue
            : pathModule.resolve(trimmedValue),
    );

    // path.normalize keeps any trailing separator, but "/foo/bar/" and
    // "/foo/bar" must compare equal when checking PATH membership. Windows
    // accepts both "/" and "\" so strip either.
    while (
        resolvedValue.length > 1
        && (resolvedValue.endsWith("/") || resolvedValue.endsWith("\\"))
    ) {
        resolvedValue = resolvedValue.slice(0, -1);
    }

    return platform === "win32"
        ? resolvedValue.toLowerCase()
        : resolvedValue;
}

async function readTextFileIfExists(path: string): Promise<string | undefined> {
    try {
        return await readFile(path, "utf8");
    }
    catch (error) {
        if (isFileMissingError(error)) {
            return undefined;
        }

        throw error;
    }
}
