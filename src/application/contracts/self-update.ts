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
    status:
        | "already-configured"
        | "configured"
        | "failed"
        | "partial-configured"
        | "skipped";
    target?: readonly string[];
    failedTargets?: readonly string[];
}

export interface SelfUpdateRuntimeOverrides {
    /**
     * Gates the Windows HKCU\Environment registry write. Must be true for the
     * real user environment to be touched; defaults to false so test sandboxes
     * never mutate the host registry by accident. Production wiring flips it
     * to true at the CLI entry point.
     */
    allowWindowsRegistryWrite?: boolean;
    configurePath?: (
        options: SelfUpdatePathConfigurationOptions,
    ) => Promise<SelfUpdatePathConfigurationResult>;
    resolveCommandPath?: (commandName: string) => string | null;
    runCommand?: (
        options: SelfUpdateCommandRunOptions,
    ) => Promise<SelfUpdateCommandRunResult>;
}
