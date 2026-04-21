import type { SelfUpdateCommandRuntime } from "./command-runner.ts";
import { runSelfUpdateCommandWithLogging } from "./command-runner.ts";
import { detectInstallationMethodFromExecPath } from "./installation.ts";

const legacyCliPackageName = "@oomol-lab/oo-cli";
const legacyPackageManagerUninstallTimeoutMs = 10_000;

const legacyPackageManagerConfigurations = {
    bun: {
        commandArguments: ["remove", "-g", legacyCliPackageName],
    },
    npm: {
        commandArguments: ["uninstall", "-g", legacyCliPackageName],
    },
    pnpm: {
        commandArguments: ["remove", "-g", legacyCliPackageName],
    },
    yarn: {
        commandArguments: ["global", "remove", legacyCliPackageName],
    },
} as const;

export interface LegacyPackageManagerCleanupRuntime extends SelfUpdateCommandRuntime {
    execPath: string;
    platform: NodeJS.Platform;
}

export async function attemptLegacyPackageManagerUninstall(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<void> {
    const installation = detectInstallationMethodFromExecPath({
        env: runtime.env,
        execPath: runtime.execPath,
        platform: runtime.platform,
    });
    const packageManager = installation.method === "native" || installation.method === "unknown"
        ? undefined
        : installation.method;

    if (packageManager === undefined) {
        return;
    }

    const configuration = legacyPackageManagerConfigurations[packageManager];
    const commandPath = runtime.resolveCommandPath?.(packageManager)
        ?? Bun.which(packageManager);

    if (commandPath === null) {
        runtime.logger.warn(
            {
                packageManager,
            },
            "Legacy package-manager oo-cli uninstall skipped because the executable was not found.",
        );
        return;
    }

    await runSelfUpdateCommandWithLogging({
        commandArguments: configuration.commandArguments,
        commandPath,
        failureMessage: "Legacy package-manager oo-cli uninstall failed.",
        logContext: {
            packageManager,
        },
        runtime,
        successMessage: "Legacy package-manager oo-cli uninstall completed.",
        timeoutMs: legacyPackageManagerUninstallTimeoutMs,
    });
}
