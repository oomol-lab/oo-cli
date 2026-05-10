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
import { isPathMissingError } from "../../application/shared/fs-errors.ts";
import { isProcessLockOwnerActive } from "../../application/shared/process-owner.ts";
import { validateQueryTimestamp } from "./sqlite-utils.ts";

const sidecarSchemaVersion = 1;
const sidecarCleanupEntryThreshold = 1000;
const sidecarLookupHardCap = 2000;
const sidecarSelfDefenseTtlMs = 14 * 24 * 60 * 60 * 1000;

const sidecarDownloadSessionSchema = z.object({
    entityTag: z.string(),
    finalUrl: z.string().trim().min(1),
    id: z.string().trim().min(1),
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

const sidecarDownloadTempLockSchema = z.object({
    execPath: z.string().trim().min(1),
    pid: z.number().int().positive(),
});

type SidecarDownloadSession = z.infer<typeof sidecarDownloadSessionSchema>;

export interface SidecarFileDownloadSessionStoreOptions {
    logger?: Logger;
}

export class SidecarFileDownloadSessionStore implements FileDownloadSessionStore {
    constructor(
        private readonly directoryPath: string,
        private readonly options: SidecarFileDownloadSessionStoreOptions = {},
    ) {}

    getFilePath(): string {
        return this.directoryPath;
    }

    async findDownloadSession(
        key: FileDownloadSessionKey,
    ): Promise<FileDownloadSessionRecord | undefined> {
        return (await this.findDownloadSessions(key))[0];
    }

    async findDownloadSessions(
        key: FileDownloadSessionKey,
    ): Promise<readonly FileDownloadSessionRecord[]> {
        validateDownloadSessionKey(key);
        await this.runSelfDefenseCleanup();

        const records = await this.readSessionFiles();
        const sessions: FileDownloadSessionRecord[] = [];

        for (const record of records) {
            if (!downloadSessionMatchesKey(record, key)) {
                continue;
            }

            if (await this.isUsableResumeCandidate(record)) {
                sessions.push(record);
            }
        }

        sessions.sort(compareDownloadSessionRecordsByRecency);

        return sessions;
    }

    async saveDownloadSession(record: FileDownloadSessionRecord): Promise<void> {
        validateDownloadSessionRecord(record);
        await this.ensureDirectory();

        const sidecar: SidecarDownloadSession = {
            ...record,
            schemaVersion: sidecarSchemaVersion,
        };
        const content = `${JSON.stringify(sidecar, null, 2)}\n`;
        const finalPath = this.resolveSessionFilePath(record.id);

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const temporaryPath = join(
                this.directoryPath,
                `${record.id}.${process.pid}.${Bun.randomUUIDv7()}.tmp`,
            );

            try {
                await writeFile(temporaryPath, content, {
                    encoding: "utf8",
                    flag: "wx",
                });
                await rename(temporaryPath, finalPath);
                this.options.logger?.debug(
                    {
                        id: record.id,
                        tempFileName: record.tempFileName,
                        ...withStorePath(this.directoryPath),
                    },
                    "Sidecar file download resume session stored.",
                );
                return;
            }
            catch (error) {
                await rm(temporaryPath, { force: true }).catch(() => undefined);

                if (attempt === 4) {
                    throw error;
                }
            }
        }
    }

    async deleteDownloadSession(id: string): Promise<boolean> {
        if (id.trim() === "") {
            throw new Error("Download session id cannot be empty.");
        }

        const filePath = this.resolveSessionFilePath(id);
        const deleted = await removePath(filePath);

        return deleted;
    }

    async deleteDownloadSessionsUpdatedBefore(cutoffMs: number): Promise<number> {
        validateQueryTimestamp(cutoffMs, "Download session");

        let deletedCount = 0;

        for (const record of await this.readSessionFiles(Number.POSITIVE_INFINITY)) {
            if (record.updatedAtMs >= cutoffMs) {
                continue;
            }

            if (await this.isRecordLockedByActiveProcess(record)) {
                continue;
            }

            await this.deleteDownloadSession(record.id);
            await this.deleteDownloadArtifacts(record);
            deletedCount += 1;
        }

        return deletedCount;
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

        const records = await Promise.all(entries
            .filter(entry => entry.endsWith(".json"))
            .slice(0, limit)
            .map(entry => this.readSessionFile(join(this.directoryPath, entry))));

        return records.filter(record => record !== undefined);
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
            rm(`${tempFilePath}.lock`, { force: true }),
        ]);
    }

    private async runSelfDefenseCleanup(): Promise<void> {
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
            await this.deleteDownloadSessionsUpdatedBefore(Date.now() - sidecarSelfDefenseTtlMs);
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
        const lockPath = join(record.outDirPath, `${record.tempFileName}.lock`);
        let parsedContent: unknown;

        try {
            parsedContent = JSON.parse(await readFile(lockPath, "utf8"));
        }
        catch {
            return false;
        }

        const result = sidecarDownloadTempLockSchema.safeParse(parsedContent);

        return result.success
            && isProcessLockOwnerActive(
                result.data.pid,
                result.data.execPath,
                process.platform,
            );
    }
}

function compareDownloadSessionRecordsByRecency(
    left: FileDownloadSessionRecord,
    right: FileDownloadSessionRecord,
): number {
    return right.updatedAtMs - left.updatedAtMs
        || right.id.localeCompare(left.id);
}

function validateDownloadSessionKey(key: FileDownloadSessionKey): void {
    if (key.requestUrl.trim() === "") {
        throw new Error("Download session requestUrl cannot be empty.");
    }

    if (key.outDirPath.trim() === "") {
        throw new Error("Download session outDirPath cannot be empty.");
    }
}

function validateDownloadSessionRecord(record: FileDownloadSessionRecord): void {
    if (record.id.trim() === "") {
        throw new Error("Download session id cannot be empty.");
    }

    validateDownloadSessionKey(record);

    if (record.resolvedBaseName.trim() === "") {
        throw new Error("Download session resolvedBaseName cannot be empty.");
    }

    if (record.tempFileName.trim() === "") {
        throw new Error("Download session tempFileName cannot be empty.");
    }

    if (record.finalUrl.trim() === "") {
        throw new Error("Download session finalUrl cannot be empty.");
    }

    if (
        record.totalBytes !== undefined
        && (!Number.isSafeInteger(record.totalBytes) || record.totalBytes < 0)
    ) {
        throw new Error("Download session totalBytes must be a safe integer.");
    }

    validateQueryTimestamp(record.updatedAtMs, "Download session");
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
