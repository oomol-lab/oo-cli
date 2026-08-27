import type { Logger } from "pino";

import type {
    FileDownloadSessionKey,
    FileDownloadSessionRecord,
    FileDownloadSessionStore,
} from "../../application/contracts/file-download-session-store.ts";

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, win32 } from "node:path";
import process from "node:process";

import { z } from "zod";

import { withStorePath } from "../../application/logging/log-fields.ts";
import {
    isDownloadTempLockActive,
    readDownloadTempLockData,
    resolveDownloadTempLockFilePath,
} from "../../application/shared/download-temp-lock.ts";
import { isPathMissingError } from "../../application/shared/fs-errors.ts";

const sidecarSchemaVersion = 1;
const sidecarCleanupEntryThreshold = 1000;
const sidecarLookupHardCap = 2000;
const sidecarSelfDefenseTtlMs = 14 * 24 * 60 * 60 * 1000;
const sidecarSelfDefenseIntervalMs = 5 * 60 * 1000;
const sidecarDownloadSessionIdSchema = z.string().min(1).refine(isSafeSessionId);

const sidecarDownloadSessionSchema = z.object({
    entityTag: z.string(),
    finalUrl: z.string().trim().min(1),
    id: sidecarDownloadSessionIdSchema,
    lastModified: z.string(),
    outDirPath: z.string().trim().min(1),
    requestUrl: z.string().trim().min(1),
    requestedExtension: z.string(),
    requestedName: z.string(),
    resolvedBaseName: z.string().trim().min(1),
    resolvedExtension: z.string(),
    schemaVersion: z.literal(sidecarSchemaVersion),
    tempFileName: z.string().trim().min(1),
    totalBytes: z.number().int().nonnegative().optional(),
    updatedAtMs: z.number().int().nonnegative(),
});

type SidecarDownloadSession = z.infer<typeof sidecarDownloadSessionSchema>;

interface SidecarSessionFile {
    readonly filePath: string;
    readonly modifiedAtMs: number;
    readonly name: string;
}

export interface SidecarFileDownloadSessionStoreOptions {
    logger?: Logger;
}

export class SidecarFileDownloadSessionStore implements FileDownloadSessionStore {
    private lastSelfDefenseAtMs = 0;

    constructor(
        private readonly directoryPath: string,
        private readonly options: SidecarFileDownloadSessionStoreOptions = {},
    ) {}

    async findDownloadSessions(
        key: FileDownloadSessionKey,
    ): Promise<readonly FileDownloadSessionRecord[]> {
        await this.runSelfDefenseCleanup();

        const records = await this.readSessionFiles();
        const matchingRecords = records.filter(record => downloadSessionMatchesKey(record, key));
        const usability = await Promise.all(
            matchingRecords.map(record => this.isUsableResumeCandidate(record)),
        );
        const sessions = matchingRecords.filter((_, index) => usability[index]);

        sessions.sort(compareDownloadSessionRecordsByRecency);

        return sessions;
    }

    async saveDownloadSession(record: FileDownloadSessionRecord): Promise<void> {
        const sidecar: SidecarDownloadSession = {
            ...record,
            schemaVersion: sidecarSchemaVersion,
        };
        const content = `${JSON.stringify(sidecar)}\n`;
        // Load-bearing position: this validates the id before any path is
        // built or written. Do not move it below the temporary path join.
        const finalPath = this.resolveSessionFilePath(record.id);
        const temporaryPath = join(
            this.directoryPath,
            `${record.id}.${process.pid}.${Bun.randomUUIDv7()}.tmp`,
        );

        try {
            await this.ensureDirectory();
            await writeFile(temporaryPath, content, { encoding: "utf8" });
            await rename(temporaryPath, finalPath);
            this.options.logger?.debug(
                {
                    id: record.id,
                    tempFileName: record.tempFileName,
                    ...withStorePath(this.directoryPath),
                },
                "Sidecar file download resume session stored.",
            );
        }
        catch (error) {
            await rm(temporaryPath, { force: true }).catch(() => undefined);
            this.options.logger?.debug(
                {
                    error,
                    id: record.id,
                    tempFileName: record.tempFileName,
                    ...withStorePath(this.directoryPath),
                },
                "Sidecar file download resume session store failed.",
            );
        }
    }

    async deleteDownloadSession(id: string): Promise<boolean> {
        validateDownloadSessionId(id);
        const filePath = this.resolveSessionFilePath(id);
        const deleted = await removePath(filePath);

        return deleted;
    }

    async deleteDownloadSessionsUpdatedBefore(cutoffMs: number): Promise<number> {
        const expiredRecords = (await this.readSessionFiles(Number.POSITIVE_INFINITY))
            .filter(record => record.updatedAtMs < cutoffMs);
        const lockedFlags = await Promise.all(
            expiredRecords.map(record => this.isRecordLockedByActiveProcess(record)),
        );
        const evictableRecords = expiredRecords.filter((_, index) => !lockedFlags[index]);
        const evictionResults = await Promise.all(
            evictableRecords.map(record => this.evictExpiredRecord(record)),
        );

        return evictionResults.filter(Boolean).length;
    }

    private async evictExpiredRecord(record: FileDownloadSessionRecord): Promise<boolean> {
        try {
            await this.deleteDownloadArtifacts(record);
        }
        catch (error) {
            this.options.logger?.debug(
                {
                    error,
                    id: record.id,
                    tempFileName: record.tempFileName,
                    ...withStorePath(this.directoryPath),
                },
                "Sidecar file download resume session artifacts cleanup failed.",
            );
            return false;
        }

        return this.deleteDownloadSession(record.id);
    }

    close(): void {
    }

    private async ensureDirectory(): Promise<void> {
        await mkdir(this.directoryPath, { recursive: true });
    }

    private async readSessionFiles(
        limit = sidecarLookupHardCap,
    ): Promise<FileDownloadSessionRecord[]> {
        let entries: string[];

        try {
            entries = await readdir(this.directoryPath);
        }
        catch (error) {
            if (isPathMissingError(error)) {
                return [];
            }

            throw error;
        }

        const sessionFiles = await Promise.all(entries
            .filter(entry => entry.endsWith(".json"))
            .map(entry => this.readSessionFileMetadata(entry)));
        const records = await Promise.all(sessionFiles
            .filter(sessionFile => sessionFile !== undefined)
            .sort(compareSidecarSessionFilesByRecency)
            .slice(0, limit)
            .map(sessionFile => this.readSessionFile(sessionFile.filePath)));

        return records.filter(record => record !== undefined);
    }

    private async readSessionFileMetadata(
        name: string,
    ): Promise<SidecarSessionFile | undefined> {
        const filePath = join(this.directoryPath, name);

        try {
            const fileStat = await stat(filePath);

            if (!fileStat.isFile()) {
                return undefined;
            }

            return {
                filePath,
                modifiedAtMs: fileStat.mtimeMs,
                name,
            };
        }
        catch {
            return undefined;
        }
    }

    private async readSessionFile(
        filePath: string,
    ): Promise<FileDownloadSessionRecord | undefined> {
        let parsedContent: unknown;

        try {
            parsedContent = JSON.parse(await readFile(filePath, "utf8"));
        }
        catch {
            return undefined;
        }

        const result = sidecarDownloadSessionSchema.safeParse(parsedContent);

        if (!result.success || !isSafeTempFileName(result.data.tempFileName)) {
            return undefined;
        }

        const { schemaVersion: _, ...record } = result.data;

        return record;
    }

    private resolveSessionFilePath(id: string): string {
        validateDownloadSessionId(id);
        return join(this.directoryPath, `${id}.json`);
    }

    private async isUsableResumeCandidate(record: FileDownloadSessionRecord): Promise<boolean> {
        const tempFilePath = join(record.outDirPath, record.tempFileName);

        try {
            return (await stat(tempFilePath)).isFile();
        }
        catch (error) {
            if (isPathMissingError(error)) {
                await this.deleteDownloadSession(record.id);
                return false;
            }

            throw error;
        }
    }

    private async deleteDownloadArtifacts(record: FileDownloadSessionRecord): Promise<void> {
        const tempFilePath = join(record.outDirPath, record.tempFileName);

        await Promise.all([
            rm(tempFilePath, { force: true }),
            rm(resolveDownloadTempLockFilePath(tempFilePath), { force: true }),
        ]);
    }

    private async runSelfDefenseCleanup(): Promise<void> {
        const now = Date.now();

        if (now - this.lastSelfDefenseAtMs < sidecarSelfDefenseIntervalMs) {
            return;
        }

        this.lastSelfDefenseAtMs = now;

        let entries: string[];

        try {
            entries = await readdir(this.directoryPath);
        }
        catch (error) {
            if (isPathMissingError(error)) {
                return;
            }

            throw error;
        }

        if (entries.length <= sidecarCleanupEntryThreshold) {
            return;
        }

        try {
            await this.deleteDownloadSessionsUpdatedBefore(now - sidecarSelfDefenseTtlMs);
        }
        catch (error) {
            this.options.logger?.debug(
                {
                    error,
                    ...withStorePath(this.directoryPath),
                },
                "Sidecar file download resume session cleanup failed.",
            );
        }
    }

    private async isRecordLockedByActiveProcess(
        record: FileDownloadSessionRecord,
    ): Promise<boolean> {
        const tempFilePath = join(record.outDirPath, record.tempFileName);
        const lockData = await readDownloadTempLockData(
            resolveDownloadTempLockFilePath(tempFilePath),
        );

        return lockData !== undefined && isDownloadTempLockActive(lockData);
    }
}

function compareDownloadSessionRecordsByRecency(
    left: FileDownloadSessionRecord,
    right: FileDownloadSessionRecord,
): number {
    return right.updatedAtMs - left.updatedAtMs
        || right.id.localeCompare(left.id);
}

function compareSidecarSessionFilesByRecency(
    left: SidecarSessionFile,
    right: SidecarSessionFile,
): number {
    return right.modifiedAtMs - left.modifiedAtMs
        || right.name.localeCompare(left.name);
}

function validateDownloadSessionId(id: string): void {
    if (id.trim() === "") {
        throw new Error("Download session id cannot be empty.");
    }

    if (!isSafeSessionId(id)) {
        throw new Error("Download session id is invalid.");
    }
}

function downloadSessionMatchesKey(
    record: FileDownloadSessionRecord,
    key: FileDownloadSessionKey,
): boolean {
    return record.requestUrl === key.requestUrl
        && record.outDirPath === key.outDirPath
        && record.requestedName === key.requestedName
        && record.requestedExtension === key.requestedExtension;
}

function isSafeTempFileName(fileName: string): boolean {
    return fileName === basename(fileName)
        && fileName === win32.basename(fileName);
}

function isSafeSessionId(value: string): boolean {
    if (
        value.length > 128
        || value.trim() !== value
        || value === "."
        || value === ".."
        || value.includes("..")
        || value !== basename(value)
        || value !== win32.basename(value)
    ) {
        return false;
    }

    for (const character of value) {
        if (!isSafeSessionIdCharacter(character)) {
            return false;
        }
    }

    return true;
}

function isSafeSessionIdCharacter(character: string): boolean {
    return character === "-"
        || character === "_"
        || character === "."
        || isAsciiDigit(character)
        || isAsciiLetter(character);
}

function isAsciiDigit(character: string): boolean {
    const code = character.charCodeAt(0);

    return code >= 48 && code <= 57;
}

function isAsciiLetter(character: string): boolean {
    const code = character.charCodeAt(0);

    return (code >= 65 && code <= 90)
        || (code >= 97 && code <= 122);
}

async function removePath(filePath: string): Promise<boolean> {
    try {
        await rm(filePath);
        return true;
    }
    catch (error) {
        if (isPathMissingError(error)) {
            return false;
        }

        throw error;
    }
}
