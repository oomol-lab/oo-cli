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
const defaultMaxFiles = 20;
let sessionCounter = 0;

export interface RollingFileDestinationOptions {
    directoryPath: string;
    filePrefix?: string;
    maxFiles?: number;
    now?: () => Date;
    pid?: number;
}

export class RollingFileDestination implements DestinationStream {
    private readonly directoryPath: string;
    private readonly filePrefix: string;
    private readonly maxFiles: number;
    private readonly sessionId: string;
    private readonly filePath: string;
    private currentFileDescriptor?: number;
    private writable = true;

    constructor(options: RollingFileDestinationOptions) {
        this.directoryPath = options.directoryPath;
        this.filePrefix = options.filePrefix ?? defaultFilePrefix;
        this.maxFiles = options.maxFiles ?? defaultMaxFiles;
        this.sessionId = createSessionId(
            options.now?.() ?? new Date(),
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

            const currentFileDescriptor = this.currentFileDescriptor;

            if (currentFileDescriptor === undefined) {
                return;
            }

            writeSync(currentFileDescriptor, String(chunk));
            this.pruneOverflowFiles();
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

    private pruneOverflowFiles(): void {
        const filePaths = this.listLogFilePaths();

        while (filePaths.length > this.maxFiles) {
            const oldestFilePath = filePaths.shift();

            if (!oldestFilePath || oldestFilePath === this.filePath) {
                continue;
            }

            try {
                unlinkSync(oldestFilePath);
            }
            catch {
            }
        }
    }

    private listLogFilePaths(): string[] {
        try {
            const entries = readdirSync(this.directoryPath, { withFileTypes: true });

            return entries
                .filter(entry =>
                    entry.isFile()
                    && entry.name.startsWith(`${this.filePrefix}-`)
                    && entry.name.endsWith(".log"))
                .map(entry => join(this.directoryPath, entry.name))
                .sort((left, right) => left.localeCompare(right));
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

function formatLocalDateTime(date: Date): string {
    const y = String(date.getFullYear()).padStart(4, "0");
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");

    return `${y}-${mo}-${d}_${h}-${mi}-${s}`;
}
