import type { Logger } from "pino";

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

type LegacyPackageManager = keyof typeof legacyPackageManagerConfigurations;

export interface LegacyPackageManagerCommandRunOptions {
    commandArguments: readonly string[];
    commandPath: string;
    env: Record<string, string | undefined>;
    timeoutMs: number;
}

export interface LegacyPackageManagerCommandRunResult {
    exitCode: number;
    signalCode: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
}

export interface LegacyPackageManagerCleanupRuntime {
    env: Record<string, string | undefined>;
    execPath: string;
    logger: Logger;
    resolveCommandPath?: (commandName: string) => string | null;
    runCommand?: (
        options: LegacyPackageManagerCommandRunOptions,
    ) => Promise<LegacyPackageManagerCommandRunResult>;
}

export function detectLegacyPackageManager(options: Pick<LegacyPackageManagerCleanupRuntime, "env" | "execPath">): LegacyPackageManager | undefined {
    return normalizeLegacyPackageManagerName(options.env.OO_INSTALL_PACKAGE_MANAGER)
        ?? detectLegacyPackageManagerFromOoPath(options.execPath);
}

export async function attemptLegacyPackageManagerUninstall(
    runtime: LegacyPackageManagerCleanupRuntime,
): Promise<void> {
    const packageManager = detectLegacyPackageManager(runtime);

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

    try {
        const result = await (runtime.runCommand ?? runLegacyPackageManagerCommand)({
            commandArguments: configuration.commandArguments,
            commandPath,
            env: runtime.env,
            timeoutMs: legacyPackageManagerUninstallTimeoutMs,
        });

        if (result.exitCode !== 0 || result.signalCode !== null) {
            runtime.logger.warn(
                {
                    commandArguments: configuration.commandArguments,
                    commandPath,
                    exitCode: result.exitCode,
                    packageManager,
                    signalCode: result.signalCode,
                    stderr: normalizeLoggedProcessOutput(result.stderr),
                    stdout: normalizeLoggedProcessOutput(result.stdout),
                },
                "Legacy package-manager oo-cli uninstall failed.",
            );
            return;
        }

        runtime.logger.info(
            {
                commandArguments: configuration.commandArguments,
                commandPath,
                packageManager,
            },
            "Legacy package-manager oo-cli uninstall completed.",
        );
    }
    catch (error) {
        runtime.logger.warn(
            {
                commandArguments: configuration.commandArguments,
                commandPath,
                err: error,
                packageManager,
            },
            "Legacy package-manager oo-cli uninstall failed.",
        );
    }
}

function detectLegacyPackageManagerFromOoPath(rawPath: string): LegacyPackageManager | undefined {
    const pathSegments = splitPathSegments(rawPath);

    if (pathSegments.includes(".bun")) {
        return "bun";
    }

    if (pathSegments.includes("pnpm")) {
        return "pnpm";
    }

    if (
        pathSegments.includes("fnm_multishells")
        || pathSegments.includes("npm_global")
        || pathSegments.includes(".nvm")
    ) {
        return "npm";
    }

    if (pathSegments.includes("yarn")) {
        return "yarn";
    }

    if (looksLikePackagedOoExecutablePath(pathSegments)) {
        return "npm";
    }

    return undefined;
}

function looksLikePackagedOoExecutablePath(pathSegments: readonly string[]): boolean {
    const nodeModulesIndex = pathSegments.lastIndexOf("node_modules");

    if (nodeModulesIndex < 0) {
        return false;
    }

    const packageScope = pathSegments[nodeModulesIndex + 1];
    const packageName = pathSegments[nodeModulesIndex + 2];

    if (packageScope !== "@oomol-lab" || packageName === undefined) {
        return false;
    }

    return packageName === "oo-cli" || packageName.startsWith("oo-cli-");
}

function splitPathSegments(rawPath: string): string[] {
    if (rawPath.trim() === "") {
        return [];
    }

    return rawPath
        .trim()
        .replaceAll("\\", "/")
        .split("/")
        .map(segment => segment.trim().toLowerCase())
        .filter(Boolean);
}

function normalizeLegacyPackageManagerName(value: string | undefined): LegacyPackageManager | undefined {
    const normalized = value?.trim().toLowerCase();

    switch (normalized) {
        case "bun":
        case "npm":
        case "pnpm":
        case "yarn":
            return normalized;
        default:
            return undefined;
    }
}

async function runLegacyPackageManagerCommand(
    options: LegacyPackageManagerCommandRunOptions,
): Promise<LegacyPackageManagerCommandRunResult> {
    const subprocess = Bun.spawn({
        cmd: [options.commandPath, ...options.commandArguments],
        env: options.env,
        stderr: "pipe",
        stdin: "ignore",
        stdout: "pipe",
        timeout: options.timeoutMs,
        windowsHide: true,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        subprocess.exited,
        readSubprocessOutput(subprocess.stdout),
        readSubprocessOutput(subprocess.stderr),
    ]);

    return {
        exitCode,
        signalCode: subprocess.signalCode,
        stderr,
        stdout,
    };
}

function normalizeLoggedProcessOutput(output: string): string | undefined {
    const trimmedOutput = output.trim();

    return trimmedOutput === ""
        ? undefined
        : trimmedOutput;
}

async function readSubprocessOutput(
    output: ReadableStream<Uint8Array<ArrayBuffer>> | number | undefined | null,
): Promise<string> {
    if (output === null || output === undefined || typeof output === "number") {
        return "";
    }

    return await new Response(output).text();
}
