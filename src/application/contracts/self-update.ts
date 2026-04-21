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

export interface SelfUpdateRuntimeOverrides {
    resolveCommandPath?: (commandName: string) => string | null;
    runCommand?: (
        options: SelfUpdateCommandRunOptions,
    ) => Promise<SelfUpdateCommandRunResult>;
}
