import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
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

    return await pathExists(resolveSelfUpdateVersionExecutablePath(
        paths,
        options.version,
    ));
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
