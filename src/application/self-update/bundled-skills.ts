import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
import { runSelfUpdateCommandWithLogging } from "./command-runner.ts";

const selfUpdateBundledSkillRefreshCommandArguments = [
    "skills",
    "add",
] as const;
const selfUpdateBundledSkillRefreshTimeoutMs = 10_000;

export async function attemptBundledSkillRefreshAfterSelfUpdate(options: {
    executablePath: string;
    runtime: SelfUpdateCommandRuntime;
}): Promise<void> {
    await runSelfUpdateCommandWithLogging({
        commandArguments: selfUpdateBundledSkillRefreshCommandArguments,
        commandPath: options.executablePath,
        failureMessage: "Bundled skill refresh after self-update failed.",
        logContext: {
            timeoutMs: selfUpdateBundledSkillRefreshTimeoutMs,
        },
        runtime: options.runtime,
        successMessage: "Bundled skill refresh after self-update completed.",
        timeoutMs: selfUpdateBundledSkillRefreshTimeoutMs,
    });
}
