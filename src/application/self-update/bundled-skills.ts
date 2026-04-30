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

const selfUpdateBundledSkillRefreshCommandArguments = [
    "skills",
    "add",
] as const;
const selfUpdateBundledSkillRefreshTimeoutMs = 10_000;

export async function resolveBundledSkillRefreshCommandPath(options: {
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

export async function attemptBundledSkillRefreshAfterSelfUpdate(options: {
    commandPath: string;
    runtime: SelfUpdateCommandRuntime;
}): Promise<void> {
    await runSelfUpdateCommandWithLogging({
        commandArguments: selfUpdateBundledSkillRefreshCommandArguments,
        commandPath: options.commandPath,
        failureMessage: "Bundled skill refresh after self-update failed.",
        logContext: {
            timeoutMs: selfUpdateBundledSkillRefreshTimeoutMs,
        },
        runtime: options.runtime,
        successMessage: "Bundled skill refresh after self-update completed.",
        timeoutMs: selfUpdateBundledSkillRefreshTimeoutMs,
    });
}
