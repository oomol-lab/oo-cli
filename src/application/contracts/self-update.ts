export interface SelfUpdateCommandRunOptions {
    commandArguments: readonly string[];
    commandPath: string;
    env: Record<string, string | undefined>;
    timeoutMs: number;
}

export interface SelfUpdateCommandRunResult {
    exitCode: number;
    signalCode: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
}

export interface SelfUpdatePathConfigurationOptions {
    env: Record<string, string | undefined>;
    executableDirectory: string;
    modifyPath?: boolean;
    platform: NodeJS.Platform;
}

export interface SelfUpdatePathConfigurationResult {
    status: "already-configured" | "configured" | "failed" | "skipped";
    target?: readonly string[];
}

export interface SelfUpdateRuntimeOverrides {
    configurePath?: (
        options: SelfUpdatePathConfigurationOptions,
    ) => Promise<SelfUpdatePathConfigurationResult>;
    resolveCommandPath?: (commandName: string) => string | null;
    runCommand?: (
        options: SelfUpdateCommandRunOptions,
    ) => Promise<SelfUpdateCommandRunResult>;
}
