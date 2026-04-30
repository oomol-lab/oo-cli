import type { DestinationStream } from "pino";
import {
    closeSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readdirSync,
    unlinkSync,
    writeSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";

const defaultFilePrefix = "debug";
const defaultRetentionDays = 7;
const logFileTimestampLength = "0000-00-00_00-00-00".length;
let sessionCounter = 0;

export interface RollingFileDestinationOptions {
    directoryPath: string;
    filePrefix?: string;
    now?: () => Date;
    pid?: number;
}

export class RollingFileDestination implements DestinationStream {
    private readonly directoryPath: string;
    private readonly filePrefix: string;
    private readonly now: () => Date;
    private readonly sessionId: string;
    private readonly filePath: string;
    private currentFileDescriptor?: number;
    private lastPrunedRetentionStart?: number;
    private writable = true;

    constructor(options: RollingFileDestinationOptions) {
        this.directoryPath = options.directoryPath;
        this.filePrefix = options.filePrefix ?? defaultFilePrefix;
        this.now = options.now ?? (() => new Date());
        this.sessionId = createSessionId(
            this.now(),
            options.pid ?? process.pid,
        );
        mkdirSync(this.directoryPath, { recursive: true });
        this.filePath = join(
            this.directoryPath,
            resolveLogFileName({
                directoryPath: this.directoryPath,
                filePrefix: this.filePrefix,
                sessionId: this.sessionId,
            }),
        );
    }

    write(chunk: string): void {
        if (!this.writable) {
            return;
        }

        try {
            this.ensureFileOpened();
            this.pruneExpiredFilesOncePerRetentionWindow();

            const currentFileDescriptor = this.currentFileDescriptor;

            if (currentFileDescriptor === undefined) {
                return;
            }

            writeSync(currentFileDescriptor, String(chunk));
        }
        catch {
            this.disableWrites();
        }
    }

    flushSync(): void {
        if (this.currentFileDescriptor === undefined) {
            return;
        }

        try {
            fsyncSync(this.currentFileDescriptor);
        }
        catch {
        }
    }

    end(): void {
        this.flushSync();
        this.disableWrites();
    }

    getFilePath(): string {
        return this.filePath;
    }

    private ensureFileOpened(): void {
        if (this.currentFileDescriptor !== undefined) {
            return;
        }

        this.currentFileDescriptor = openSync(this.filePath, "a");
    }

    private pruneExpiredFilesOncePerRetentionWindow(): void {
        const retentionStart = resolveRetentionStart(this.now());
        const retentionStartTime = retentionStart.getTime();

        if (this.lastPrunedRetentionStart === retentionStartTime) {
            return;
        }

        this.lastPrunedRetentionStart = retentionStartTime;

        for (const logFile of this.listLogFiles()) {
            if (
                logFile.filePath === this.filePath
                || logFile.timestamp === undefined
                || logFile.timestamp >= retentionStart
            ) {
                continue;
            }

            try {
                unlinkSync(logFile.filePath);
            }
            catch {
            }
        }
    }

    private listLogFiles(): LogFileEntry[] {
        try {
            const entries = readdirSync(this.directoryPath, { withFileTypes: true });

            return entries
                .filter(entry =>
                    entry.isFile()
                    && entry.name.startsWith(`${this.filePrefix}-`)
                    && entry.name.endsWith(".log"))
                .map(entry => ({
                    filePath: join(this.directoryPath, entry.name),
                    timestamp: parseLogFileTimestamp(entry.name, this.filePrefix),
                }));
        }
        catch {
            return [];
        }
    }

    private closeCurrentFile(): void {
        if (this.currentFileDescriptor === undefined) {
            return;
        }

        try {
            closeSync(this.currentFileDescriptor);
        }
        catch {
        }
        finally {
            this.currentFileDescriptor = undefined;
        }
    }

    private disableWrites(): void {
        this.closeCurrentFile();
        this.writable = false;
    }
}

interface LogFileEntry {
    filePath: string;
    timestamp: Date | undefined;
}

function createSessionId(now: Date, pid: number): string {
    return `${formatLocalDateTime(now)}-p${pid}`;
}

function resolveLogFileName(options: {
    directoryPath: string;
    filePrefix: string;
    sessionId: string;
}): string {
    const baseFileName = `${options.filePrefix}-${options.sessionId}.log`;
    const existingFileNames = listExistingLogFileNames(options.directoryPath);

    if (!existingFileNames.includes(baseFileName)) {
        return baseFileName;
    }

    sessionCounter += 1;

    return `${options.filePrefix}-${options.sessionId}-${String(sessionCounter).padStart(2, "0")}.log`;
}

function listExistingLogFileNames(directoryPath: string): string[] {
    try {
        return readdirSync(directoryPath, { withFileTypes: true })
            .filter(entry => entry.isFile())
            .map(entry => entry.name);
    }
    catch {
        return [];
    }
}

function resolveRetentionStart(now: Date): Date {
    const retentionStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    );

    retentionStart.setDate(retentionStart.getDate() - (defaultRetentionDays - 1));

    return retentionStart;
}

function parseLogFileTimestamp(
    fileName: string,
    filePrefix: string,
): Date | undefined {
    const prefix = `${filePrefix}-`;
    const timestamp = fileName.slice(
        prefix.length,
        prefix.length + logFileTimestampLength,
    );

    if (
        !fileName.startsWith(prefix)
        || !fileName.endsWith(".log")
        || timestamp.length !== logFileTimestampLength
        || !hasLogFileTimestampSeparators(timestamp)
    ) {
        return undefined;
    }

    const year = readFixedInteger(timestamp, 0, 4);
    const month = readFixedInteger(timestamp, 5, 2);
    const day = readFixedInteger(timestamp, 8, 2);
    const hour = readFixedInteger(timestamp, 11, 2);
    const minute = readFixedInteger(timestamp, 14, 2);
    const second = readFixedInteger(timestamp, 17, 2);

    if (
        year === undefined
        || month === undefined
        || day === undefined
        || hour === undefined
        || minute === undefined
        || second === undefined
    ) {
        return undefined;
    }

    const parsed = new Date(year, month - 1, day, hour, minute, second);

    if (
        parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
        || parsed.getHours() !== hour
        || parsed.getMinutes() !== minute
        || parsed.getSeconds() !== second
    ) {
        return undefined;
    }

    return parsed;
}

function hasLogFileTimestampSeparators(timestamp: string): boolean {
    return timestamp.at(4) === "-"
        && timestamp.at(7) === "-"
        && timestamp.at(10) === "_"
        && timestamp.at(13) === "-"
        && timestamp.at(16) === "-";
}

function readFixedInteger(
    value: string,
    startIndex: number,
    length: number,
): number | undefined {
    let parsed = 0;

    for (const char of value.slice(startIndex, startIndex + length)) {
        const digit = char.charCodeAt(0) - "0".charCodeAt(0);

        if (digit < 0 || digit > 9) {
            return undefined;
        }

        parsed = parsed * 10 + digit;
    }

    return parsed;
}

function formatLocalDateTime(date: Date): string {
    const y = String(date.getFullYear()).padStart(4, "0");
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");

    return `${y}-${mo}-${d}_${h}-${mi}-${s}`;
}
