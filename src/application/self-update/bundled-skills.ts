import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isPathAccessDeniedError, isPathMissingError } from "../shared/fs-errors.ts";
import { pathExists } from "../shared/fs-utils.ts";
import { runSelfUpdateCommandWithLogging } from "./command-runner.ts";
import {
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionExecutablePath,
} from "./paths.ts";

const managedSkillInstallTimeoutMs = 40_000;

export async function resolveManagedSkillInstallCommandPath(options: {
    env: Record<string, string | undefined>;
    platform: NodeJS.Platform;
    version: string;
}): Promise<string> {
    const paths = resolveSelfUpdatePaths({
        env: options.env,
        platform: options.platform,
    });
    const versionCommandPath = resolveSelfUpdateVersionExecutablePath(
        paths,
        options.version,
    );

    return await pathExists(versionCommandPath)
        ? versionCommandPath
        : paths.executablePath;
}

export async function isManagedVersionExecutableInstalled(options: {
    env: Record<string, string | undefined>;
    platform: NodeJS.Platform;
    version: string;
}): Promise<boolean> {
    const paths = resolveSelfUpdatePaths({
        env: options.env,
        platform: options.platform,
    });
    const executablePath = resolveSelfUpdateVersionExecutablePath(
        paths,
        options.version,
    );

    try {
        const metadata = await stat(executablePath);

        if (!metadata.isFile()) {
            return false;
        }

        if (options.platform === "win32") {
            return true;
        }

        await access(executablePath, constants.X_OK);
        return true;
    }
    catch (error) {
        if (isPathMissingError(error) || isPathAccessDeniedError(error)) {
            return false;
        }

        throw error;
    }
}

export async function attemptManagedSkillInstall(options: {
    commandPath: string;
    runtime: SelfUpdateCommandRuntime;
}): Promise<void> {
    await runSelfUpdateCommandWithLogging({
        commandArguments: ["skills", "add"],
        commandPath: options.commandPath,
        failureMessage: "Managed skill install failed.",
        logContext: {
            timeoutMs: managedSkillInstallTimeoutMs,
        },
        runtime: options.runtime,
        successMessage: "Managed skill install completed.",
        timeoutMs: managedSkillInstallTimeoutMs,
    });
}
