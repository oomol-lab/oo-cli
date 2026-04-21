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

export interface SelfUpdateRuntimeOverrides {
    resolveCommandPath?: (commandName: string) => string | null;
    runCommand?: (
        options: LegacyPackageManagerCommandRunOptions,
    ) => Promise<LegacyPackageManagerCommandRunResult>;
}
