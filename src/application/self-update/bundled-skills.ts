import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
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
