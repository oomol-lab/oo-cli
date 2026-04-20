import type { CliExecutionContext, CliMessageParams } from "../contracts/cli.ts";
import type { Translator } from "../contracts/translator.ts";

import {
    copyFile,
    lstat,
    mkdir,
    realpath,
    rename,
    rm,
    stat,
    symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, win32 } from "node:path";
import process from "node:process";
import { APP_NAME } from "../config/app-config.ts";
import { CliUserError } from "../contracts/cli.ts";
import { writeLine } from "./shared/output.ts";

export interface InstallSource {
    displayPath: string;
    executablePath: string;
}

export interface InstallTarget {
    binDir: string;
    binaryPath: string;
    displayBinDir: string;
    displayBinaryPath: string;
    isWindows: boolean;
    platform: NodeJS.Platform;
}

export interface InstallBinaryResult {
    changed: boolean;
    mode: "copy" | "symlink";
}

export interface SetupNote {
    message: string;
    type: "info" | "path";
}

export interface SelfInstallRuntime {
    argv0: string | undefined;
    execPath: string;
    main: string;
    pid: number;
    platform: NodeJS.Platform;
    tempDirectoryPath: string;
}

interface FileStatsLike {
    isDirectory: () => boolean;
    isFile: () => boolean;
    isSymbolicLink: () => boolean;
    mode: number;
}

interface SelfInstallFileDependencies {
    copyFile?: (sourcePath: string, targetPath: string) => Promise<void>;
    lstat?: (path: string) => Promise<FileStatsLike>;
    mkdir?: (
        path: string,
        options: {
            recursive: true;
        },
    ) => Promise<void>;
    realpath?: (path: string) => Promise<string>;
    rename?: (sourcePath: string, targetPath: string) => Promise<void>;
    rm?: (
        path: string,
        options: {
            force: true;
            recursive: true;
        },
    ) => Promise<void>;
    stat?: (path: string) => Promise<FileStatsLike>;
    symlink?: (targetPath: string, linkPath: string) => Promise<void>;
}

export interface SelfInstallDependencies extends SelfInstallFileDependencies {
    now?: () => number;
    runtime?: SelfInstallRuntime;
}

class SelfInstallError extends Error {
    constructor(
        readonly key: string,
        readonly params?: CliMessageParams,
    ) {
        super(key);
        this.name = "SelfInstallError";
    }
}

export async function runSelfInstall(
    context: CliExecutionContext,
    dependencies: SelfInstallDependencies = {},
): Promise<void> {
    writeLine(
        context.stdout,
        context.translator.t("install.progress.installing"),
    );

    try {
        const runtime = dependencies.runtime ?? resolveDefaultInstallRuntime();
        const source = await resolveInstallSource(runtime, dependencies);
        const target = resolveInstallTarget({
            env: context.env,
            platform: runtime.platform,
        });
        const installResult = await installBinary(
            source,
            target,
            runtime,
            dependencies,
        );

        await verifyInstall(target, dependencies);

        writeLine(context.stdout, context.translator.t("install.success.title"));
        writeLine(
            context.stdout,
            context.translator.t("install.success.location", {
                path: target.displayBinaryPath,
            }),
        );
        writeLine(context.stdout, context.translator.t("install.success.next"));

        const setupNotes = checkPathSetup(target, {
            cwd: context.cwd,
            env: context.env,
            platform: runtime.platform,
            translator: context.translator,
        });

        if (setupNotes.length > 0) {
            writeLine(context.stdout, "");
            writeLine(
                context.stdout,
                context.translator.t("install.setupNotes.title"),
            );

            for (const note of setupNotes) {
                writeSetupNote(context.stdout, note);
            }
        }

        context.logger.info(
            {
                changed: installResult.changed,
                installMode: installResult.mode,
                pathConfigured: setupNotes.length === 0,
                sourcePath: source.executablePath,
                targetPath: target.binaryPath,
            },
            "CLI binary installed.",
        );
    }
    catch (error) {
        if (error instanceof SelfInstallError) {
            throw new CliUserError("errors.install.failed", 1, {
                reason: context.translator.t(error.key, error.params),
            });
        }

        throw new CliUserError("errors.install.failed", 1, {
            reason: context.translator.t("errors.unexpected", {
                message: toErrorMessage(error),
            }),
        });
    }
}

export async function resolveInstallSource(
    runtime: SelfInstallRuntime,
    dependencies: SelfInstallFileDependencies = {},
): Promise<InstallSource> {
    const realpathFn = dependencies.realpath ?? realpath;
    const statFn = dependencies.stat ?? stat;

    try {
        const executablePath = await realpathFn(runtime.execPath);

        if (!isStableLocalBinaryRuntime(runtime, executablePath)) {
            throw new SelfInstallError("errors.install.invalidSource");
        }

        const executableStats = await statFn(executablePath);

        if (!isExecutableFile(executableStats, runtime.platform, executablePath)) {
            throw new SelfInstallError("errors.install.invalidSource");
        }

        return {
            displayPath: executablePath,
            executablePath,
        };
    }
    catch (error) {
        if (error instanceof SelfInstallError) {
            throw error;
        }

        throw new SelfInstallError("errors.install.invalidSource");
    }
}

export function resolveInstallTarget(options: {
    env: Record<string, string | undefined>;
    platform: NodeJS.Platform;
}): InstallTarget {
    const executableFileName = resolveExecutableFileName(options.platform);
    const pathModule = resolvePathModule(options.platform);
    const homeDirectory = resolveTargetHomeDirectory(options.env, options.platform);
    const binDir = pathModule.join(homeDirectory, ".local", "bin");
    const binaryPath = pathModule.join(binDir, executableFileName);

    return {
        binDir,
        binaryPath,
        displayBinDir: options.platform === "win32"
            ? binDir
            : posix.join("~", ".local", "bin"),
        displayBinaryPath: options.platform === "win32"
            ? binaryPath
            : posix.join("~", ".local", "bin", executableFileName),
        isWindows: options.platform === "win32",
        platform: options.platform,
    };
}

export async function installBinary(
    source: InstallSource,
    target: InstallTarget,
    runtime: Pick<SelfInstallRuntime, "pid">,
    dependencies: SelfInstallDependencies = {},
): Promise<InstallBinaryResult> {
    await ensureInstallDirectory(target, dependencies);

    if (target.isWindows) {
        return await installWindowsBinary(
            source,
            target,
            dependencies.now ?? Date.now,
            dependencies,
        );
    }

    return await installUnixBinary(
        source,
        target,
        runtime,
        dependencies.now ?? Date.now,
        dependencies,
    );
}

export async function verifyInstall(
    target: InstallTarget,
    dependencies: SelfInstallFileDependencies = {},
): Promise<void> {
    const lstatFn = dependencies.lstat ?? lstat;
    const realpathFn = dependencies.realpath ?? realpath;
    const statFn = dependencies.stat ?? stat;

    try {
        const binDirectoryStats = await statFn(target.binDir);

        if (!binDirectoryStats.isDirectory()) {
            throw new Error("install directory does not exist");
        }

        const targetStats = await statFn(target.binaryPath);

        if (!isExecutableFile(targetStats, target.platform, target.binaryPath)) {
            throw new Error("installed binary is not executable");
        }

        if (!target.isWindows) {
            const linkStats = await lstatFn(target.binaryPath);

            if (!linkStats.isSymbolicLink()) {
                throw new Error("installed binary is not a symbolic link");
            }

            await realpathFn(target.binaryPath);
        }
    }
    catch (error) {
        throw new SelfInstallError("errors.install.verifyFailed", {
            message: toErrorMessage(error),
            path: target.displayBinaryPath,
        });
    }
}

export function checkPathSetup(
    target: InstallTarget,
    options: {
        cwd: string;
        env: Record<string, string | undefined>;
        platform: NodeJS.Platform;
        translator: Pick<Translator, "t">;
    },
): SetupNote[] {
    const pathEntries = splitPathEntries(
        options.env.PATH,
        options.platform,
    );
    const normalizedTargetDirectory = normalizePathForComparison(
        target.binDir,
        options.platform,
        options.cwd,
    );
    const pathContainsTargetDirectory = pathEntries.some(pathEntry =>
        normalizePathForComparison(
            pathEntry,
            options.platform,
            options.cwd,
        ) === normalizedTargetDirectory,
    );

    if (pathContainsTargetDirectory) {
        return [];
    }

    return [
        {
            message: options.translator.t(
                resolvePathSetupMessageKey(options.platform, options.env.SHELL),
                {
                    path: target.displayBinDir,
                },
            ),
            type: "path",
        },
    ];
}

function resolveDefaultInstallRuntime(): SelfInstallRuntime {
    return {
        argv0: process.argv0,
        execPath: process.execPath,
        main: Bun.main,
        pid: process.pid,
        platform: process.platform,
        tempDirectoryPath: tmpdir(),
    };
}

async function ensureInstallDirectory(
    target: InstallTarget,
    dependencies: SelfInstallFileDependencies,
): Promise<void> {
    const mkdirFn = dependencies.mkdir ?? mkdir;

    try {
        await mkdirFn(target.binDir, { recursive: true });
    }
    catch (error) {
        throw new SelfInstallError("errors.install.mkdirFailed", {
            message: toErrorMessage(error),
            path: target.displayBinDir,
        });
    }
}

async function installUnixBinary(
    source: InstallSource,
    target: InstallTarget,
    runtime: Pick<SelfInstallRuntime, "pid">,
    now: () => number,
    dependencies: SelfInstallFileDependencies,
): Promise<InstallBinaryResult> {
    const realpathFn = dependencies.realpath ?? realpath;
    const renameFn = dependencies.rename ?? rename;
    const rmFn = dependencies.rm ?? rm;
    const symlinkFn = dependencies.symlink ?? symlink;
    const currentTargetPath = await realpathFn(target.binaryPath).catch(
        () => undefined,
    );

    if (currentTargetPath === source.executablePath) {
        return {
            changed: false,
            mode: "symlink",
        };
    }

    const temporaryBinaryPath
        = `${target.binaryPath}.tmp.${runtime.pid}.${now()}`;

    try {
        await rmFn(temporaryBinaryPath, {
            force: true,
            recursive: true,
        }).catch(() => undefined);
        await symlinkFn(source.executablePath, temporaryBinaryPath);

        try {
            await renameFn(temporaryBinaryPath, target.binaryPath);
        }
        catch {
            await rmFn(target.binaryPath, {
                force: true,
                recursive: true,
            });
            await renameFn(temporaryBinaryPath, target.binaryPath);
        }

        return {
            changed: true,
            mode: "symlink",
        };
    }
    catch (error) {
        throw new SelfInstallError("errors.install.writeFailed", {
            message: toErrorMessage(error),
            path: target.displayBinaryPath,
        });
    }
    finally {
        await rmFn(temporaryBinaryPath, {
            force: true,
            recursive: true,
        }).catch(() => undefined);
    }
}

async function installWindowsBinary(
    source: InstallSource,
    target: InstallTarget,
    now: () => number,
    dependencies: SelfInstallFileDependencies,
): Promise<InstallBinaryResult> {
    const copyFileFn = dependencies.copyFile ?? copyFile;
    const realpathFn = dependencies.realpath ?? realpath;
    const renameFn = dependencies.rename ?? rename;
    const rmFn = dependencies.rm ?? rm;
    const currentTargetPath = await realpathFn(target.binaryPath).catch(
        () => undefined,
    );

    if (currentTargetPath === source.executablePath) {
        return {
            changed: false,
            mode: "copy",
        };
    }

    const backupPath = `${target.binaryPath}.old.${now()}`;
    let movedExistingTarget = false;

    try {
        if (currentTargetPath !== undefined) {
            await renameFn(target.binaryPath, backupPath);
            movedExistingTarget = true;
        }

        await copyFileFn(source.executablePath, target.binaryPath);
    }
    catch (error) {
        if (movedExistingTarget) {
            try {
                await renameFn(backupPath, target.binaryPath);
            }
            catch (rollbackError) {
                throw new SelfInstallError("errors.install.rollbackFailed", {
                    message:
                        `${toErrorMessage(error)}; rollback error: ${toErrorMessage(rollbackError)}`,
                    path: target.displayBinaryPath,
                });
            }
        }

        throw new SelfInstallError("errors.install.writeFailed", {
            message: toErrorMessage(error),
            path: target.displayBinaryPath,
        });
    }

    if (movedExistingTarget) {
        await rmFn(backupPath, {
            force: true,
            recursive: true,
        }).catch(() => undefined);
    }

    return {
        changed: true,
        mode: "copy",
    };
}

function writeSetupNote(
    stream: CliExecutionContext["stdout"],
    note: SetupNote,
): void {
    const [firstLine = "", ...remainingLines] = note.message.split("\n");

    writeLine(stream, `• ${firstLine}`);

    for (const line of remainingLines) {
        if (line === "") {
            writeLine(stream, "");
            continue;
        }

        writeLine(stream, `  ${line}`);
    }
}

function isStableLocalBinaryRuntime(
    runtime: SelfInstallRuntime,
    executablePath: string,
): boolean {
    if (isPathInside(
        runtime.tempDirectoryPath,
        executablePath,
        runtime.platform,
    )) {
        return false;
    }

    if (isCompiledEmbeddedEntryPath(runtime.main)) {
        return true;
    }

    const executableFileName = resolveExecutableFileName(runtime.platform)
        .toLowerCase();
    const pathModule = resolvePathModule(runtime.platform);
    const executableName = pathModule.basename(runtime.execPath).toLowerCase();
    const argv0Name = runtime.argv0 === undefined
        ? ""
        : pathModule.basename(runtime.argv0).toLowerCase();

    return executableName === executableFileName
        || argv0Name === executableFileName;
}

function isCompiledEmbeddedEntryPath(mainPath: string): boolean {
    return mainPath.replaceAll("\\", "/").includes("/$bunfs/");
}

function resolveTargetHomeDirectory(
    env: Record<string, string | undefined>,
    platform: NodeJS.Platform,
): string {
    const homeDirectory = platform === "win32"
        ? env.USERPROFILE ?? env.HOME
        : env.HOME ?? env.USERPROFILE;

    if (homeDirectory !== undefined && homeDirectory !== "") {
        return homeDirectory;
    }

    return platform === "win32"
        ? process.env.USERPROFILE ?? process.env.HOME ?? ""
        : process.env.HOME ?? process.env.USERPROFILE ?? "";
}

function resolveExecutableFileName(platform: NodeJS.Platform): string {
    return platform === "win32" ? `${APP_NAME}.exe` : APP_NAME;
}

function splitPathEntries(
    pathValue: string | undefined,
    platform: NodeJS.Platform,
): string[] {
    if (pathValue === undefined || pathValue === "") {
        return [];
    }

    return pathValue
        .split(platform === "win32" ? ";" : ":")
        .filter(pathEntry => pathEntry !== "");
}

function normalizePathForComparison(
    value: string,
    platform: NodeJS.Platform,
    cwd: string,
): string {
    const pathModule = resolvePathModule(platform);
    const resolvedPath = pathModule.resolve(cwd, value);

    return platform === "win32"
        ? resolvedPath.toLowerCase()
        : resolvedPath;
}

function resolvePathSetupMessageKey(
    platform: NodeJS.Platform,
    shellPath: string | undefined,
): string {
    if (platform === "win32") {
        return "install.setupNotes.path.win32";
    }

    switch (resolveShellName(shellPath)) {
        case "bash":
            return "install.setupNotes.path.bash";
        case "fish":
            return "install.setupNotes.path.fish";
        case "zsh":
            return "install.setupNotes.path.zsh";
        default:
            return "install.setupNotes.path.unknown";
    }
}

function resolveShellName(shellPath: string | undefined): string | undefined {
    if (shellPath === undefined || shellPath === "") {
        return undefined;
    }

    const normalizedShellPath = shellPath.replaceAll("\\", "/");
    const shellName = normalizedShellPath
        .slice(normalizedShellPath.lastIndexOf("/") + 1)
        .toLowerCase();

    return shellName.endsWith(".exe")
        ? shellName.slice(0, -4)
        : shellName;
}

function resolvePathModule(
    platform: NodeJS.Platform,
): typeof posix | typeof win32 {
    return platform === "win32" ? win32 : posix;
}

function isPathInside(
    parentPath: string,
    childPath: string,
    platform: NodeJS.Platform,
): boolean {
    const pathModule = resolvePathModule(platform);
    const relativePath = pathModule.relative(
        pathModule.resolve(parentPath),
        pathModule.resolve(childPath),
    );

    if (relativePath === "" || relativePath === ".") {
        return false;
    }

    return !relativePath.startsWith("..")
        && !pathModule.isAbsolute(relativePath);
}

function isExecutableFile(
    stats: FileStatsLike,
    platform: NodeJS.Platform,
    filePath: string,
): boolean {
    if (!stats.isFile()) {
        return false;
    }

    if (platform === "win32") {
        return filePath.toLowerCase().endsWith(".exe");
    }

    return (stats.mode & 0o111) !== 0;
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
