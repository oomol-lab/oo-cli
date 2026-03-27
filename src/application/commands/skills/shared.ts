import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { BundledSkillName } from "./embedded-assets.ts";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
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
const bundledSkillVersionFileName = ".oo-version";
const bundledSkillOwnershipMarker = "OOMOL";
const bundledSkillOwnershipFileRelativePath = "agents/openai.yaml";
const bundledSkillImplicitInvocationKey = "allow_implicit_invocation";

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

export function resolveBundledSkillVersionFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillVersionFileName);
}

export async function installBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const settings = await context.settingsStore.read();
    const installedSkillDirectoryPath = resolveBundledSkillDirectoryPath(
        codexHomeDirectory,
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

    const skillDirectoryPath = await writeBundledSkillInstallation({
        codexHomeDirectory,
        settings,
        skillName,
        version: context.version,
    });

    writeLine(
        context,
        context.translator.t("skills.install.success", {
            name: skillName,
            path: skillDirectoryPath,
        }),
    );
    context.logger.info(
        {
            path: skillDirectoryPath,
            skillName,
            version: context.version,
        },
        "Bundled Codex skill installed explicitly.",
    );
}

export async function maybeSynchronizeInstalledBundledSkills(
    context: Pick<CliExecutionContext, "env" | "logger" | "version">,
    options: {
        installMissing?: boolean;
        settings?: AppSettings;
    } = {},
): Promise<void> {
    const codexHomeDirectory = resolveCodexHomeDirectory(context.env);
    const settings = options.settings ?? defaultSettings;

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

                await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    skillName,
                    version: context.version,
                });
                context.logger.info(
                    {
                        path: skillDirectoryPath,
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

                await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    skillName,
                    version: context.version,
                });
                context.logger.info(
                    {
                        path: skillDirectoryPath,
                        previousVersion: previousVersion ?? "unknown",
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill synchronized.",
                );
                continue;
            }

            const desiredImplicitInvocation
                = resolveBundledSkillImplicitInvocation(
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

            if (installedImplicitInvocation === undefined) {
                const previousVersion
                    = await readInstalledBundledSkillVersion(skillDirectoryPath);

                await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    skillName,
                    version: context.version,
                });
                context.logger.info(
                    {
                        path: skillDirectoryPath,
                        previousVersion: previousVersion ?? "unknown",
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill synchronized.",
                );
                continue;
            }

            await writeInstalledBundledSkillImplicitInvocation(
                skillDirectoryPath,
                desiredImplicitInvocation,
            );
            context.logger.info(
                {
                    implicitInvocation: desiredImplicitInvocation,
                    path: skillDirectoryPath,
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

    await rm(skillDirectoryPath, { force: true, recursive: true });

    writeLine(
        context,
        context.translator.t("skills.uninstall.success", {
            name: skillName,
            path: skillDirectoryPath,
        }),
    );
    context.logger.info(
        {
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
    skillName: BundledSkillName;
    version: string;
}): Promise<string> {
    const skillDirectoryPath = resolveBundledSkillDirectoryPath(
        options.codexHomeDirectory,
        options.skillName,
    );

    await mkdir(skillDirectoryPath, { recursive: true });

    for (const file of getBundledSkillFiles(options.skillName)) {
        const destinationPath = join(skillDirectoryPath, file.relativePath);

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

    await Bun.write(
        resolveBundledSkillVersionFilePath(skillDirectoryPath),
        `${options.version}\n`,
    );

    return skillDirectoryPath;
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

async function writeInstalledBundledSkillImplicitInvocation(
    skillDirectoryPath: string,
    value: boolean,
): Promise<void> {
    const ownershipFilePath = join(
        skillDirectoryPath,
        bundledSkillOwnershipFileRelativePath,
    );
    const content = await readFile(ownershipFilePath, "utf8");

    await Bun.write(
        ownershipFilePath,
        writeImplicitInvocationValue(content, value),
    );
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
    const lines = content.split("\n");

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

        return lines.join("\n");
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

    const installedVersion = await readInstalledBundledSkillVersion(
        skillDirectoryPath,
    );

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
    try {
        const version = (
            await readFile(
                resolveBundledSkillVersionFilePath(skillDirectoryPath),
                "utf8",
            )
        ).trim();

        return version === "" ? undefined : version;
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
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

function writeLine(context: CliExecutionContext, message: string): void {
    context.stdout.write(`${message}\n`);
}
