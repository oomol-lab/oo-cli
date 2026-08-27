import type { LevelWithSilentOrString, Logger } from "pino";

import pino from "pino";
import { serializeErrorForLogging } from "../../application/logging/url-sanitizer.ts";
import { RollingFileDestination } from "./rolling-file-destination.ts";

export interface CliLoggerOptions {
    appName: string;
    env: Record<string, string | undefined>;
    logDirectoryPath: string;
}

export interface CliLoggerHandle {
    close: () => void;
    logger: Logger;
    logFilePath: string;
}

export function createCliLogger(options: CliLoggerOptions): CliLoggerHandle {
    const level = resolveLogLevel(options.env);
    const fileDestination = new RollingFileDestination({
        directoryPath: options.logDirectoryPath,
    });
    const logger = pino(
        {
            name: options.appName,
            level,
            timestamp: pino.stdTimeFunctions.isoTime,
            serializers: {
                err: serializeErrorForLogging,
            },
            formatters: {
                level(label) {
                    return { level: label };
                },
            },
        },
        fileDestination,
    );

    return {
        logger,
        logFilePath: fileDestination.getFilePath(),
        close() {
            fileDestination.end();
        },
    };
}

function resolveLogLevel(
    env: Record<string, string | undefined>,
): LevelWithSilentOrString {
    return env.OO_LOG_LEVEL ?? "debug";
}
