import type { LevelWithSilentOrString, Logger } from "pino";

import pino from "pino";
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

let activeLoggerCount = 0;

export function createCliLogger(options: CliLoggerOptions): CliLoggerHandle {
    if (activeLoggerCount > 0) {
        throw new Error("Only one active CLI logger can exist at a time.");
    }

    activeLoggerCount += 1;

    try {
        const level = resolveLogLevel(options.env);
        const fileDestination = new RollingFileDestination({
            directoryPath: options.logDirectoryPath,
        });
        const logger = pino(
            {
                name: options.appName,
                level,
                timestamp: pino.stdTimeFunctions.isoTime,
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
                try {
                    fileDestination.end();
                }
                finally {
                    if (activeLoggerCount > 0) {
                        activeLoggerCount -= 1;
                    }
                }
            },
        };
    }
    catch (error) {
        activeLoggerCount -= 1;
        throw error;
    }
}

function resolveLogLevel(
    env: Record<string, string | undefined>,
): LevelWithSilentOrString {
    return env.OO_LOG_LEVEL ?? "debug";
}
