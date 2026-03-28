import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { BundledSkillName } from "./embedded-assets.ts";
import {
    cp,
    lstat,
    mkdir,
    readFile,
    readlink,
    realpath,
    rm,
    rmdir,
    stat,
    symlink,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { CliUserError } from "../../contracts/cli.ts";
import { resolveHomeDirectory } from "../../path/home-directory.ts";
import {
    defaultSettings,
    getOoSkillImplicitInvocation,
} from "../../schemas/settings.ts";
import {
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";

const codexDirectoryName = ".codex";
const codexSkillsDirectoryName = "skills";
const bundledSkillMetadataFileName = ".oo-metadata.json";
const bundledSkillOwnershipMarker = "OOMOL";
const bundledSkillOwnershipFileRelativePath = "agents/openai.yaml";
const bundledSkillImplicitInvocationKey = "allow_implicit_invocation";

interface BundledSkillMetadata {
    version: string;
}

export interface BundledSkillPublicationResult {
    mode: "copy" | "symlink";
    path: string;
}

interface BundledSkillPublicationDependencies {
    createDirectorySymlink?: (
        targetPath: string,
        linkPath: string,
    ) => Promise<boolean>;
}

export interface CreateBundledSkillDirectorySymlinkDependencies {
    lstat?: (path: string) => Promise<{
        isSymbolicLink: () => boolean;
    }>;
    mkdir?: (
        path: string,
        options: {
            recursive: true;
        },
    ) => Promise<void>;
    readlink?: (path: string) => Promise<string>;
    realpath?: (path: string) => Promise<string>;
    removePath?: (path: string) => Promise<void>;
    resolveParentSymlinks?: (path: string) => Promise<string>;
    symlink?: (
        targetPath: string,
        linkPath: string,
        type: "dir" | "junction",
    ) => Promise<void>;
    platform?: NodeJS.Platform;
}

export function resolveCodexHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    const explicitCodexHome = env.CODEX_HOME?.trim();

    if (explicitCodexHome) {
        return explicitCodexHome;
    }

    return join(resolveHomeDirectory(env), codexDirectoryName);
}

export function resolveBundledSkillDirectoryPath(
    codexHomeDirectory: string,
    skillName: BundledSkillName,
): string {
    return join(codexHomeDirectory, codexSkillsDirectoryName, skillName);
}

export function resolveBundledSkillCanonicalDirectoryPath(
    settingsFilePath: string,
    skillName: BundledSkillName,
): string {
    return join(dirname(settingsFilePath), codexSkillsDirectoryName, skillName);
}

export function resolveBundledSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillMetadataFileName);
}

export async function installBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const settings = await context.settingsStore.read();
    const settingsFilePath = context.settingsStore.getFilePath();
    const installedSkillDirectoryPath = resolveBundledSkillDirectoryPath(
        codexHomeDirectory,
        skillName,
    );
    const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );

    if (
        await directoryExists(installedSkillDirectoryPath)
        && !(await isManagedBundledSkillInstallation(installedSkillDirectoryPath))
    ) {
        context.logger.warn(
            {
                path: installedSkillDirectoryPath,
                skillName,
            },
            "Bundled Codex skill install was blocked by an unmanaged directory.",
        );
        throw new CliUserError("errors.skills.nameConflict", 1, {
            name: skillName,
            path: installedSkillDirectoryPath,
        });
    }

    if (
        await directoryExists(canonicalSkillDirectoryPath)
        && !(await isManagedBundledSkillInstallation(canonicalSkillDirectoryPath))
    ) {
        context.logger.warn(
            {
                path: canonicalSkillDirectoryPath,
                skillName,
            },
            "Bundled Codex skill install was blocked by an unmanaged canonical directory.",
        );
        throw new CliUserError("errors.skills.storageConflict", 1, {
            name: skillName,
            path: canonicalSkillDirectoryPath,
        });
    }

    const installation = await writeBundledSkillInstallation({
        codexHomeDirectory,
        settings,
        settingsFilePath,
        skillName,
        version: context.version,
    });

    writeLine(
        context,
        context.translator.t("skills.install.success", {
            name: skillName,
            path: installation.path,
        }),
    );
    context.logger.info(
        {
            canonicalPath: canonicalSkillDirectoryPath,
            installMode: installation.mode,
            path: installation.path,
            skillName,
            version: context.version,
        },
        "Bundled Codex skill installed explicitly.",
    );
}

export async function maybeSynchronizeInstalledBundledSkills(
    context: Pick<CliExecutionContext, "env" | "logger" | "settingsStore" | "version">,
    options: {
        installMissing?: boolean;
        settings?: AppSettings;
    } = {},
): Promise<void> {
    const codexHomeDirectory = resolveCodexHomeDirectory(context.env);
    const settings = options.settings ?? defaultSettings;
    const settingsFilePath = context.settingsStore.getFilePath();

    if (!(await directoryExists(codexHomeDirectory))) {
        context.logger.debug(
            {
                path: codexHomeDirectory,
            },
            "Bundled Codex skill synchronization skipped because Codex home is missing.",
        );
        return;
    }

    for (const skillName of availableBundledSkillNames) {
        const skillDirectoryPath = resolveBundledSkillDirectoryPath(
            codexHomeDirectory,
            skillName,
        );
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            settingsFilePath,
            skillName,
        );

        try {
            if (!(await directoryExists(skillDirectoryPath))) {
                if (options.installMissing !== true) {
                    context.logger.debug(
                        {
                            path: skillDirectoryPath,
                            skillName,
                            version: context.version,
                        },
                        "Bundled Codex skill synchronization skipped because the managed skill is not installed.",
                    );
                    continue;
                }

                const installation = await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    settingsFilePath,
                    skillName,
                    version: context.version,
                });
                context.logger.info(
                    {
                        canonicalPath: canonicalSkillDirectoryPath,
                        installMode: installation.mode,
                        path: installation.path,
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill installed during first-run bootstrap.",
                );
                continue;
            }

            if (!(await isManagedBundledSkillInstallation(skillDirectoryPath))) {
                context.logger.debug(
                    {
                        path: skillDirectoryPath,
                        skillName,
                    },
                    "Bundled Codex skill synchronization skipped because the existing directory is not managed by OOMOL.",
                );
                continue;
            }

            if (
                !(await isBundledSkillInstallationCurrent(
                    skillName,
                    skillDirectoryPath,
                    context.version,
                ))
            ) {
                const previousVersion
                    = await readInstalledBundledSkillVersion(skillDirectoryPath);
                const installation = await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    settingsFilePath,
                    skillName,
                    version: context.version,
                });

                context.logger.info(
                    {
                        canonicalPath: canonicalSkillDirectoryPath,
                        installMode: installation.mode,
                        path: installation.path,
                        previousVersion: previousVersion ?? "unknown",
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill synchronized.",
                );
                continue;
            }

            const desiredImplicitInvocation = resolveBundledSkillImplicitInvocation(
                skillName,
                settings,
            );
            const installedImplicitInvocation
                = await readInstalledBundledSkillImplicitInvocation(
                    skillDirectoryPath,
                );

            if (installedImplicitInvocation === desiredImplicitInvocation) {
                context.logger.debug(
                    {
                        path: skillDirectoryPath,
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill synchronization skipped because the managed skill is already current.",
                );
                continue;
            }

            const installation = await writeBundledSkillInstallation({
                codexHomeDirectory,
                settings,
                settingsFilePath,
                skillName,
                version: context.version,
            });
            context.logger.info(
                {
                    canonicalPath: canonicalSkillDirectoryPath,
                    implicitInvocation: desiredImplicitInvocation,
                    installMode: installation.mode,
                    path: installation.path,
                    skillName,
                    version: context.version,
                },
                "Bundled Codex skill policy synchronized.",
            );
        }
        catch (error) {
            context.logger.warn(
                {
                    err: error,
                    path: skillDirectoryPath,
                    skillName,
                    version: context.version,
                },
                "Failed to synchronize bundled Codex skill.",
            );
        }
    }
}

export async function uninstallBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const skillDirectoryPath = resolveBundledSkillDirectoryPath(
        codexHomeDirectory,
        skillName,
    );
    const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
        context.settingsStore.getFilePath(),
        skillName,
    );

    if (
        !(await directoryExists(skillDirectoryPath))
        || !(await isManagedBundledSkillInstallation(skillDirectoryPath))
    ) {
        context.logger.warn(
            {
                path: skillDirectoryPath,
                skillName,
            },
            "Bundled Codex skill uninstall skipped because no managed installation was found.",
        );
        throw new CliUserError("errors.skills.notInstalled", 1, {
            name: skillName,
            path: skillDirectoryPath,
        });
    }

    const previousVersion = await readInstalledBundledSkillVersion(skillDirectoryPath);

    await removePath(skillDirectoryPath);
    await removePath(canonicalSkillDirectoryPath);

    writeLine(
        context,
        context.translator.t("skills.uninstall.success", {
            name: skillName,
            path: skillDirectoryPath,
        }),
    );
    context.logger.info(
        {
            canonicalPath: canonicalSkillDirectoryPath,
            path: skillDirectoryPath,
            previousVersion: previousVersion ?? "unknown",
            skillName,
        },
        "Bundled Codex skill removed explicitly.",
    );
}

async function writeBundledSkillInstallation(options: {
    codexHomeDirectory: string;
    settings: AppSettings;
    settingsFilePath: string;
    skillName: BundledSkillName;
    version: string;
}): Promise<BundledSkillPublicationResult> {
    const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
        options.settingsFilePath,
        options.skillName,
    );
    const installedSkillDirectoryPath = resolveBundledSkillDirectoryPath(
        options.codexHomeDirectory,
        options.skillName,
    );

    await removePath(canonicalSkillDirectoryPath);
    await mkdir(canonicalSkillDirectoryPath, { recursive: true });

    for (const file of getBundledSkillFiles(options.skillName)) {
        const destinationPath = join(
            canonicalSkillDirectoryPath,
            file.relativePath,
        );

        await mkdir(dirname(destinationPath), { recursive: true });
        await Bun.write(
            destinationPath,
            await renderBundledSkillFileContent(
                options.skillName,
                file.relativePath,
                await Bun.file(file.sourcePath).text(),
                options.settings,
            ),
        );
    }

    await writeInstalledBundledSkillMetadata(
        canonicalSkillDirectoryPath,
        {
            version: options.version,
        },
    );

    return publishBundledSkillInstallation({
        canonicalSkillDirectoryPath,
        installedSkillDirectoryPath,
    });
}

function renderBundledSkillFileContent(
    skillName: BundledSkillName,
    relativePath: string,
    content: string,
    settings: AppSettings,
): string {
    if (relativePath !== bundledSkillOwnershipFileRelativePath) {
        return content;
    }

    return writeImplicitInvocationValue(
        content,
        resolveBundledSkillImplicitInvocation(skillName, settings),
    );
}

function resolveBundledSkillImplicitInvocation(
    skillName: BundledSkillName,
    settings: AppSettings,
): boolean {
    switch (skillName) {
        case "oo":
            return getOoSkillImplicitInvocation(settings);
    }
}

async function readInstalledBundledSkillImplicitInvocation(
    skillDirectoryPath: string,
): Promise<boolean | undefined> {
    try {
        const content = await readFile(
            join(skillDirectoryPath, bundledSkillOwnershipFileRelativePath),
            "utf8",
        );

        return readImplicitInvocationValue(content);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

function readImplicitInvocationValue(
    content: string,
): boolean | undefined {
    for (const line of content.split("\n")) {
        const trimmedLine = line.trim();

        if (!trimmedLine.startsWith(`${bundledSkillImplicitInvocationKey}:`)) {
            continue;
        }

        const rawValue = trimmedLine
            .slice(bundledSkillImplicitInvocationKey.length + 1)
            .trim();

        if (rawValue === "true") {
            return true;
        }

        if (rawValue === "false") {
            return false;
        }

        return undefined;
    }

    return undefined;
}

function writeImplicitInvocationValue(
    content: string,
    value: boolean,
): string {
    const lineSeparator = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(lineSeparator);

    for (const [index, line] of lines.entries()) {
        const trimmedLine = line.trim();

        if (!trimmedLine.startsWith(`${bundledSkillImplicitInvocationKey}:`)) {
            continue;
        }

        const indentation = line.slice(0, line.length - line.trimStart().length);

        lines[index] = [
            indentation,
            bundledSkillImplicitInvocationKey,
            ": ",
            value ? "true" : "false",
        ].join("");

        return lines.join(lineSeparator);
    }

    throw new Error(
        `Missing ${bundledSkillImplicitInvocationKey} in bundled skill policy file.`,
    );
}

async function isBundledSkillInstallationCurrent(
    skillName: BundledSkillName,
    skillDirectoryPath: string,
    version: string,
): Promise<boolean> {
    if (!(await isManagedBundledSkillInstallation(skillDirectoryPath))) {
        return false;
    }

    if (!(await fileExists(resolveBundledSkillMetadataFilePath(skillDirectoryPath)))) {
        return false;
    }

    const installedVersion = await readInstalledBundledSkillVersion(skillDirectoryPath);

    if (installedVersion !== version) {
        return false;
    }

    for (const file of getBundledSkillFiles(skillName)) {
        if (!(await fileExists(join(skillDirectoryPath, file.relativePath)))) {
            return false;
        }
    }

    return true;
}

async function isManagedBundledSkillInstallation(
    skillDirectoryPath: string,
): Promise<boolean> {
    try {
        const content = await readFile(
            join(
                skillDirectoryPath,
                bundledSkillOwnershipFileRelativePath,
            ),
            "utf8",
        );

        return content.includes(bundledSkillOwnershipMarker);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

async function readInstalledBundledSkillVersion(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    const metadata = await readInstalledBundledSkillMetadata(
        skillDirectoryPath,
    );

    return metadata?.version;
}

async function readInstalledBundledSkillMetadata(
    skillDirectoryPath: string,
): Promise<BundledSkillMetadata | undefined> {
    try {
        const content = await readFile(
            resolveBundledSkillMetadataFilePath(skillDirectoryPath),
            "utf8",
        );

        return parseBundledSkillMetadataContent(content);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

async function writeInstalledBundledSkillMetadata(
    skillDirectoryPath: string,
    metadata: BundledSkillMetadata,
): Promise<void> {
    await Bun.write(
        resolveBundledSkillMetadataFilePath(skillDirectoryPath),
        renderBundledSkillMetadataContent(metadata),
    );
}

function parseBundledSkillMetadataContent(
    content: string,
): BundledSkillMetadata | undefined {
    let parsedContent: unknown;

    try {
        parsedContent = JSON.parse(content);
    }
    catch {
        return undefined;
    }

    if (
        typeof parsedContent !== "object"
        || parsedContent === null
        || Array.isArray(parsedContent)
    ) {
        return undefined;
    }

    const rawVersion = (parsedContent as Record<string, unknown>).version;

    if (typeof rawVersion !== "string") {
        return undefined;
    }

    const version = rawVersion.trim();

    if (version === "") {
        return undefined;
    }

    return {
        version,
    };
}

function renderBundledSkillMetadataContent(
    metadata: BundledSkillMetadata,
): string {
    return `${JSON.stringify(metadata, null, 2)}\n`;
}

async function requireCodexHomeDirectory(
    context: Pick<CliExecutionContext, "env">,
): Promise<string> {
    const codexHomeDirectory = resolveCodexHomeDirectory(context.env);

    if (!(await directoryExists(codexHomeDirectory))) {
        throw new CliUserError("errors.skills.codexNotInstalled", 1, {
            path: codexHomeDirectory,
        });
    }

    return codexHomeDirectory;
}

export async function publishBundledSkillInstallation(
    options: {
        canonicalSkillDirectoryPath: string;
        installedSkillDirectoryPath: string;
    },
    dependencies: BundledSkillPublicationDependencies = {},
): Promise<BundledSkillPublicationResult> {
    const createDirectoryLink
        = dependencies.createDirectorySymlink ?? createBundledSkillDirectorySymlink;
    const symlinkCreated = await createDirectoryLink(
        options.canonicalSkillDirectoryPath,
        options.installedSkillDirectoryPath,
    );

    if (symlinkCreated) {
        return {
            mode: "symlink",
            path: options.installedSkillDirectoryPath,
        };
    }

    await copyBundledSkillDirectory(
        options.canonicalSkillDirectoryPath,
        options.installedSkillDirectoryPath,
    );

    return {
        mode: "copy",
        path: options.installedSkillDirectoryPath,
    };
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

async function fileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

function isNodeNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isSymlinkLoopError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ELOOP";
}

export async function createBundledSkillDirectorySymlink(
    targetPath: string,
    linkPath: string,
    dependencies: CreateBundledSkillDirectorySymlinkDependencies = {},
): Promise<boolean> {
    const lstatFn = dependencies.lstat ?? lstat;
    const mkdirFn = dependencies.mkdir ?? mkdir;
    const readlinkFn = dependencies.readlink ?? readlink;
    const realpathFn = dependencies.realpath ?? realpath;
    const removePathFn = dependencies.removePath ?? removePath;
    const resolveParentSymlinksFn
        = dependencies.resolveParentSymlinks ?? resolveParentSymlinks;
    const symlinkFn = dependencies.symlink ?? symlink;
    const runtimePlatform = dependencies.platform ?? process.platform;

    try {
        const resolvedTargetPath = resolve(targetPath);
        const resolvedLinkPath = resolve(linkPath);
        const [realTargetPath, realLinkPath] = await Promise.all([
            realpathFn(resolvedTargetPath).catch(() => resolvedTargetPath),
            realpathFn(resolvedLinkPath).catch(() => resolvedLinkPath),
        ]);

        if (realTargetPath === realLinkPath) {
            return true;
        }

        const [realTargetPathWithParents, realLinkPathWithParents]
            = await Promise.all([
                resolveParentSymlinksFn(resolvedTargetPath),
                resolveParentSymlinksFn(resolvedLinkPath),
            ]);

        if (realTargetPathWithParents === realLinkPathWithParents) {
            return true;
        }

        try {
            const existingStats = await lstatFn(resolvedLinkPath);

            if (existingStats.isSymbolicLink()) {
                const existingTarget = await readlinkFn(resolvedLinkPath);

                if (
                    resolveSymlinkTarget(resolvedLinkPath, existingTarget)
                    === resolvedTargetPath
                ) {
                    return true;
                }
            }

            await removePathFn(resolvedLinkPath);
        }
        catch (error) {
            if (isSymlinkLoopError(error)) {
                try {
                    await removePathFn(resolvedLinkPath);
                }
                catch {
                    // Let symlink creation determine whether copy fallback is needed.
                }
            }
            else if (!isNodeNotFoundError(error)) {
                throw error;
            }
        }

        const linkDirectoryPath = dirname(resolvedLinkPath);

        await mkdirFn(linkDirectoryPath, { recursive: true });

        const symlinkTargetPath = runtimePlatform === "win32"
            ? resolvedTargetPath
            : relative(
                    await resolveParentSymlinksFn(linkDirectoryPath),
                    resolvedTargetPath,
                );

        await symlinkFn(
            symlinkTargetPath,
            resolvedLinkPath,
            runtimePlatform === "win32" ? "junction" : "dir",
        );

        return true;
    }
    catch {
        return false;
    }
}

async function copyBundledSkillDirectory(
    sourcePath: string,
    destinationPath: string,
): Promise<void> {
    await removePath(destinationPath);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, {
        dereference: true,
        force: true,
        recursive: true,
    });
}

async function removePath(path: string): Promise<void> {
    try {
        const pathStats = await lstat(path);

        if (pathStats.isSymbolicLink()) {
            await removeSymbolicPath(path);
            return;
        }

        await rm(path, { force: true, recursive: true });
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return;
        }

        throw error;
    }
}

async function removeSymbolicPath(path: string): Promise<void> {
    try {
        await rm(path, { force: true });
    }
    catch (error) {
        if (process.platform === "win32" && isWindowsBadAddressError(error)) {
            await rmdir(path);
            return;
        }

        throw error;
    }
}

function isWindowsBadAddressError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "EFAULT";
}

async function resolveParentSymlinks(path: string): Promise<string> {
    const resolvedPath = resolve(path);
    const parentPath = dirname(resolvedPath);
    const baseName = basename(resolvedPath);

    try {
        const realParentPath = await realpath(parentPath);

        return join(realParentPath, baseName);
    }
    catch {
        return resolvedPath;
    }
}

function resolveSymlinkTarget(
    linkPath: string,
    linkTargetPath: string,
): string {
    return resolve(dirname(linkPath), linkTargetPath);
}

function writeLine(context: CliExecutionContext, message: string): void {
    context.stdout.write(`${message}\n`);
}
