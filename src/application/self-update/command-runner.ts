import type { Logger } from "pino";
import type {
    SelfUpdateCommandRunOptions,
    SelfUpdateCommandRunResult,
    SelfUpdateRuntimeOverrides,
} from "../contracts/self-update.ts";

export interface SelfUpdateCommandRuntime extends SelfUpdateRuntimeOverrides {
    env: Record<string, string | undefined>;
    logger: Logger;
}

export async function runSelfUpdateCommand(
    options: SelfUpdateCommandRunOptions,
): Promise<SelfUpdateCommandRunResult> {
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

export async function runSelfUpdateCommandWithLogging(options: {
    commandArguments: readonly string[];
    commandPath: string;
    failureMessage: string;
    logContext?: Record<string, unknown>;
    runtime: SelfUpdateCommandRuntime;
    successMessage: string;
    timeoutMs: number;
}): Promise<void> {
    const baseLogFields = {
        ...options.logContext,
        commandArguments: options.commandArguments,
        commandPath: options.commandPath,
    };

    try {
        const result = await (options.runtime.runCommand ?? runSelfUpdateCommand)({
            commandArguments: options.commandArguments,
            commandPath: options.commandPath,
            env: options.runtime.env,
            timeoutMs: options.timeoutMs,
        });

        if (result.exitCode !== 0 || result.signalCode !== null) {
            options.runtime.logger.warn(
                {
                    ...baseLogFields,
                    exitCode: result.exitCode,
                    signalCode: result.signalCode,
                    stderr: normalizeLoggedCommandOutput(result.stderr),
                    stdout: normalizeLoggedCommandOutput(result.stdout),
                },
                options.failureMessage,
            );
            return;
        }

        options.runtime.logger.info(baseLogFields, options.successMessage);
    }
    catch (error) {
        options.runtime.logger.warn(
            {
                ...baseLogFields,
                err: error,
            },
            options.failureMessage,
        );
    }
}

export function normalizeLoggedCommandOutput(
    output: string,
): string | undefined {
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
