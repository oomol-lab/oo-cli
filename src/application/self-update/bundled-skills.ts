import type { CliExecutionContext } from "../contracts/cli.ts";
import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
import { isBundledSkillAutoSyncEnabled } from "../schemas/settings.ts";
import { runSelfUpdateCommandWithLogging } from "./command-runner.ts";

const managedSkillInstallTimeoutMs = 40_000;

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

/**
 * Whether the post-install `oo skills add` should run, from
 * `skills.bundled.auto_sync`. A settings file that cannot be read falls back to
 * the default instead of failing: the binary is already installed by the time
 * this matters, and a broken preference file must not turn a finished update
 * into an error.
 */
export async function resolveManagedSkillInstallEnabled(
    context: Pick<CliExecutionContext, "logger" | "settingsStore">,
): Promise<boolean> {
    try {
        return isBundledSkillAutoSyncEnabled(await context.settingsStore.read());
    }
    catch (error) {
        context.logger.warn(
            { err: error },
            "Reading skills.bundled.auto_sync failed; installing bundled skills as by default.",
        );

        return true;
    }
}
