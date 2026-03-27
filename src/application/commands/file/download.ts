import type { PathLike, Stats } from "node:fs";

import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type {
    FileDownloadSessionKey,
    FileDownloadSessionRecord,
} from "../../contracts/file-download-session-store.ts";
import type { ResolvedDownloadFileName } from "./file-name-utils.ts";
import { link, lstat, mkdir, open, rm, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import { expandHomeDirectoryPath } from "../../path/home-directory.ts";
import {
    defaultFileDownloadOutDir,
    getConfiguredFileDownloadOutDir,
} from "../../schemas/settings.ts";
import { resolveDownloadFileName, splitFileNameParts } from "./file-name-utils.ts";

interface FileDownloadInput {
    ext?: string;
    name?: string;
    outDir?: string;
    url: string;
}

type DownloadFileHandle = Awaited<ReturnType<typeof open>>;

interface ExistingDownloadSession {
    localBytes: number;
    session: FileDownloadSessionRecord;
    tempFilePath: string;
}

interface WriteDownloadPlan {
    initialBytes: number;
    kind: "write-response";
    mode: "append" | "fresh";
    resolvedFileName: ResolvedDownloadFileName;
    response: Response;
    session: FileDownloadSessionRecord;
    tempFilePath: string;
    totalBytes?: number;
}

interface FinalizeDownloadPlan {
    kind: "finalize-existing";
    resolvedFileName: ResolvedDownloadFileName;
    session: FileDownloadSessionRecord;
    tempFilePath: string;
}

type DownloadPlan = FinalizeDownloadPlan | WriteDownloadPlan;

interface ParsedContentRange {
    end: number;
    start: number;
    totalBytes?: number;
}

const staleDownloadSessionTtlMs = 14 * 24 * 60 * 60 * 1000;

export const fileDownloadCommand: CliCommandDefinition<FileDownloadInput> = {
    name: "download",
    summaryKey: "commands.file.download.summary",
    descriptionKey: "commands.file.download.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "url",
            descriptionKey: "arguments.url",
            required: true,
        },
        {
            name: "outDir",
            descriptionKey: "arguments.outDir",
            required: false,
        },
    ],
    options: [
        {
            name: "name",
            longFlag: "--name",
            valueName: "name",
            descriptionKey: "options.fileDownloadName",
        },
        {
            name: "ext",
            longFlag: "--ext",
            valueName: "ext",
            descriptionKey: "options.fileDownloadExt",
        },
    ],
    inputSchema: z.object({
        ext: z.string().optional(),
        name: z.string().optional(),
        outDir: z.string().optional(),
        url: z.string(),
    }),
    handler: async (input, context) => {
        const requestUrl = parseFileDownloadUrl(input.url);
        const requestedName = parseFileDownloadNameOption(input.name);
        const requestedExtension = parseFileDownloadExtensionOption(input.ext);
        context.fileDownloadSessionStore.deleteDownloadSessionsUpdatedBefore(
            Date.now() - staleDownloadSessionTtlMs,
        );
        const outputDirectoryInput
            = input.outDir
                ?? getConfiguredFileDownloadOutDir(await context.settingsStore.read())
                ?? defaultFileDownloadOutDir;
        const outputDirectoryPath = await ensureOutputDirectory(
            outputDirectoryInput,
            context.cwd,
            context.env,
        );
        const sessionKey = createDownloadSessionKey({
            outDirPath: outputDirectoryPath,
            requestUrl: requestUrl.toString(),
            requestedExtension,
            requestedName,
        });
        const downloadPlan = await resolveDownloadPlan(
            requestUrl,
            sessionKey,
            context,
        );

        if (downloadPlan.kind === "write-response") {
            const progressReporter = createDownloadProgressReporter(
                context.stderr,
                downloadPlan.totalBytes,
            );
            const temporaryFileHandle = await openTemporaryDownloadFile(
                downloadPlan.tempFilePath,
                downloadPlan.mode,
                downloadPlan.initialBytes,
            );
            await writeDownloadToTemporaryFile(
                downloadPlan.response,
                temporaryFileHandle,
                downloadPlan.tempFilePath,
                progressReporter,
                downloadPlan.initialBytes,
            );

            const temporaryFileMetadata = await stat(downloadPlan.tempFilePath);

            if (
                downloadPlan.totalBytes !== undefined
                && temporaryFileMetadata.size !== downloadPlan.totalBytes
            ) {
                throw createDownloadFailedError(
                    downloadPlan.tempFilePath,
                    `Expected ${downloadPlan.totalBytes} bytes but found ${temporaryFileMetadata.size}.`,
                );
            }
        }

        const finalFilePath = await finalizeDownloadedFile(
            downloadPlan.tempFilePath,
            outputDirectoryPath,
            downloadPlan.resolvedFileName.baseName,
            downloadPlan.resolvedFileName.extension,
        );

        context.fileDownloadSessionStore.deleteDownloadSession(downloadPlan.session.id);
        context.logger.info(
            {
                finalFilePath,
                temporaryFilePath: downloadPlan.tempFilePath,
            },
            "File download completed.",
        );
        context.stdout.write(
            `${context.translator.t("file.download.savedTo", {
                path: finalFilePath,
            })}\n`,
        );
    },
};

export function parseFileDownloadNameOption(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalizedValue = value.trim();

    if (
        normalizedValue === ""
        || normalizedValue === "."
        || normalizedValue === ".."
        || hasPathSeparator(normalizedValue)
    ) {
        throw new CliUserError("errors.fileDownload.invalidName", 2, {
            value,
        });
    }

    return normalizedValue;
}

export function parseFileDownloadExtensionOption(
    value: string | undefined,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "" || trimmedValue === "." || trimmedValue === "..") {
        throw new CliUserError("errors.fileDownload.invalidExt", 2, {
            value,
        });
    }

    const normalizedValue = trimmedValue.startsWith(".")
        ? trimmedValue.slice(1)
        : trimmedValue;

    if (
        normalizedValue === ""
        || normalizedValue === "."
        || normalizedValue === ".."
        || normalizedValue.startsWith(".")
        || hasPathSeparator(normalizedValue)
    ) {
        throw new CliUserError("errors.fileDownload.invalidExt", 2, {
            value,
        });
    }

    return normalizedValue;
}

function parseFileDownloadUrl(value: string): URL {
    let url: URL;

    try {
        url = new URL(value);
    }
    catch {
        throw new CliUserError("errors.fileDownload.invalidUrl", 2, {
            value,
        });
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new CliUserError("errors.fileDownload.invalidUrl", 2, {
            value,
        });
    }

    return url;
}

async function ensureOutputDirectory(
    outDir: string | undefined,
    cwd: string,
    env: Record<string, string | undefined>,
): Promise<string> {
    const outputDirectoryPath = resolve(
        cwd,
        expandHomeDirectoryPath(outDir ?? ".", env),
    );
    let metadata: Stats | undefined;

    try {
        metadata = await stat(outputDirectoryPath);
    }
    catch (error) {
        if (!isErrorCode(error, "ENOENT")) {
            throw createOutputDirectoryError(outputDirectoryPath, error);
        }
    }

    if (metadata !== undefined) {
        if (!metadata.isDirectory()) {
            throw new CliUserError("errors.fileDownload.outDirNotDirectory", 1, {
                path: outputDirectoryPath,
            });
        }

        return outputDirectoryPath;
    }

    try {
        await mkdir(outputDirectoryPath, { recursive: true });
    }
    catch (error) {
        throw createOutputDirectoryError(outputDirectoryPath, error);
    }

    return outputDirectoryPath;
}

function createOutputDirectoryError(
    outputDirectoryPath: string,
    error: unknown,
): CliUserError {
    return new CliUserError("errors.fileDownload.outDirCreateFailed", 1, {
        message: error instanceof Error ? error.message : String(error),
        path: outputDirectoryPath,
    });
}

function createDownloadSessionKey(options: {
    outDirPath: string;
    requestUrl: string;
    requestedExtension?: string;
    requestedName?: string;
}): FileDownloadSessionKey {
    return {
        outDirPath: options.outDirPath,
        requestUrl: options.requestUrl,
        requestedExtension: options.requestedExtension ?? "",
        requestedName: options.requestedName ?? "",
    };
}

async function resolveDownloadPlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    context: Pick<
        CliExecutionContext,
        "fetcher" | "fileDownloadSessionStore" | "logger" | "stderr"
    >,
): Promise<DownloadPlan> {
    const existingSession = await loadExistingDownloadSession(sessionKey, context);

    if (existingSession === undefined) {
        return createFreshDownloadPlan(
            requestUrl,
            sessionKey,
            context,
        );
    }

    if (
        existingSession.session.totalBytes !== undefined
        && existingSession.localBytes === existingSession.session.totalBytes
    ) {
        return {
            kind: "finalize-existing",
            resolvedFileName: readResolvedFileName(existingSession.session),
            session: existingSession.session,
            tempFilePath: existingSession.tempFilePath,
        };
    }

    const resumeResponse = await requestFileDownload(
        requestUrl,
        context,
        {
            headers: buildResumeRequestHeaders(
                existingSession.localBytes,
                existingSession.session,
            ),
        },
        [416],
    );

    if (resumeResponse.status === 206) {
        const contentRange = parseContentRange(
            resumeResponse.headers.get("Content-Range"),
        );

        if (
            contentRange === undefined
            || contentRange.start !== existingSession.localBytes
            || (
                existingSession.session.totalBytes !== undefined
                && contentRange.totalBytes !== undefined
                && contentRange.totalBytes !== existingSession.session.totalBytes
            )
        ) {
            await deleteDownloadSessionArtifacts(
                existingSession,
                context.fileDownloadSessionStore,
            );

            return createFreshDownloadPlan(
                requestUrl,
                sessionKey,
                context,
                [existingSession.session.tempFileName],
            );
        }

        if (contentRange.totalBytes === undefined) {
            await deleteDownloadSessionArtifacts(
                existingSession,
                context.fileDownloadSessionStore,
            );

            return createFreshDownloadPlan(
                requestUrl,
                sessionKey,
                context,
                [existingSession.session.tempFileName],
            );
        }

        const resumedSession = updateDownloadSessionFromResumeResponse(
            existingSession.session,
            resumeResponse,
            contentRange.totalBytes,
        );

        context.fileDownloadSessionStore.saveDownloadSession(resumedSession);

        return {
            initialBytes: existingSession.localBytes,
            kind: "write-response",
            mode: "append",
            resolvedFileName: readResolvedFileName(resumedSession),
            response: resumeResponse,
            session: resumedSession,
            tempFilePath: existingSession.tempFilePath,
            totalBytes: contentRange.totalBytes,
        };
    }

    if (resumeResponse.status === 416) {
        if (
            existingSession.session.totalBytes !== undefined
            && existingSession.localBytes === existingSession.session.totalBytes
        ) {
            return {
                kind: "finalize-existing",
                resolvedFileName: readResolvedFileName(existingSession.session),
                session: existingSession.session,
                tempFilePath: existingSession.tempFilePath,
            };
        }

        await deleteDownloadSessionArtifacts(
            existingSession,
            context.fileDownloadSessionStore,
        );

        return createFreshDownloadPlan(
            requestUrl,
            sessionKey,
            context,
            [existingSession.session.tempFileName],
        );
    }

    if (resumeResponse.status === 200) {
        await deleteDownloadSessionArtifacts(
            existingSession,
            context.fileDownloadSessionStore,
        );

        return createDownloadPlanFromResponse(
            requestUrl,
            sessionKey,
            resumeResponse,
            context.fileDownloadSessionStore,
            [existingSession.session.tempFileName],
        );
    }

    await deleteDownloadSessionArtifacts(
        existingSession,
        context.fileDownloadSessionStore,
    );

    return createDownloadPlanFromResponse(
        requestUrl,
        sessionKey,
        resumeResponse,
        context.fileDownloadSessionStore,
        [existingSession.session.tempFileName],
    );
}

async function createFreshDownloadPlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    context: Pick<
        CliExecutionContext,
        "fetcher" | "fileDownloadSessionStore" | "logger"
    >,
    reservedTempFileNames: readonly string[] = [],
): Promise<WriteDownloadPlan> {
    const response = await requestFileDownload(
        requestUrl,
        context,
        {
            headers: buildRequestHeaders(),
        },
    );

    return createDownloadPlanFromResponse(
        requestUrl,
        sessionKey,
        response,
        context.fileDownloadSessionStore,
        reservedTempFileNames,
    );
}

async function createDownloadPlanFromResponse(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    response: Response,
    sessionStore: Pick<CliExecutionContext["fileDownloadSessionStore"], "saveDownloadSession">,
    reservedTempFileNames: readonly string[] = [],
): Promise<WriteDownloadPlan> {
    const session = await createDownloadSessionRecord(
        requestUrl,
        sessionKey,
        response,
        reservedTempFileNames,
    );

    sessionStore.saveDownloadSession(session);

    return {
        initialBytes: 0,
        kind: "write-response",
        mode: "fresh",
        resolvedFileName: readResolvedFileName(session),
        response,
        session,
        tempFilePath: join(session.outDirPath, session.tempFileName),
        totalBytes: session.totalBytes,
    };
}

async function loadExistingDownloadSession(
    sessionKey: FileDownloadSessionKey,
    context: Pick<
        CliExecutionContext,
        "fileDownloadSessionStore"
    >,
): Promise<ExistingDownloadSession | undefined> {
    const session = context.fileDownloadSessionStore.findDownloadSession(sessionKey);

    if (session === undefined) {
        return undefined;
    }

    const tempFilePath = join(session.outDirPath, session.tempFileName);
    let metadata: Stats;

    try {
        metadata = await stat(tempFilePath);
    }
    catch (error) {
        if (isErrorCode(error, "ENOENT")) {
            context.fileDownloadSessionStore.deleteDownloadSession(session.id);
            return undefined;
        }

        throw createDownloadFailedError(
            tempFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }

    if (!metadata.isFile() || metadata.size === 0) {
        await deleteDownloadSessionArtifacts(
            {
                localBytes: metadata.size,
                session,
                tempFilePath,
            },
            context.fileDownloadSessionStore,
        );

        return undefined;
    }

    if (
        session.totalBytes !== undefined
        && metadata.size > session.totalBytes
    ) {
        await deleteDownloadSessionArtifacts(
            {
                localBytes: metadata.size,
                session,
                tempFilePath,
            },
            context.fileDownloadSessionStore,
        );

        return undefined;
    }

    return {
        localBytes: metadata.size,
        session,
        tempFilePath,
    };
}

async function requestFileDownload(
    requestUrl: URL,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
    init?: RequestInit,
    allowedStatuses: readonly number[] = [],
): Promise<Response> {
    const requestStartedAt = Date.now();

    context.logger.debug(
        {
            method: "GET",
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            query: requestUrl.searchParams.toString(),
            url: requestUrl.toString(),
        },
        "File download request started.",
    );

    try {
        const response = await context.fetcher(requestUrl, init);
        const durationMs = Date.now() - requestStartedAt;

        if (!response.ok && !allowedStatuses.includes(response.status)) {
            context.logger.warn(
                {
                    durationMs,
                    method: "GET",
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    status: response.status,
                    url: requestUrl.toString(),
                },
                "File download request returned a non-success status.",
            );
            throw new CliUserError("errors.fileDownload.requestFailed", 1, {
                status: response.status,
            });
        }

        context.logger.debug(
            {
                durationMs,
                method: "GET",
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                finalUrl: response.url === "" ? requestUrl.toString() : response.url,
                status: response.status,
                url: requestUrl.toString(),
            },
            "File download request completed.",
        );

        return response;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                method: "GET",
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                url: requestUrl.toString(),
            },
            "File download request failed unexpectedly.",
        );
        throw new CliUserError("errors.fileDownload.requestError", 1, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

function buildRequestHeaders(): Headers {
    const headers = new Headers();

    headers.set("Accept-Encoding", "identity");

    return headers;
}

function buildResumeRequestHeaders(
    localBytes: number,
    session: FileDownloadSessionRecord,
): Headers {
    const headers = buildRequestHeaders();

    headers.set("Range", `bytes=${localBytes}-`);

    const ifRangeValue = resolveIfRangeHeader(session);

    if (ifRangeValue !== undefined) {
        headers.set("If-Range", ifRangeValue);
    }

    return headers;
}

function resolveIfRangeHeader(
    session: FileDownloadSessionRecord,
): string | undefined {
    if (
        session.entityTag !== ""
        && !session.entityTag.startsWith("W/")
    ) {
        return session.entityTag;
    }

    if (session.lastModified !== "") {
        return session.lastModified;
    }

    return undefined;
}

async function createDownloadSessionRecord(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    response: Response,
    reservedTempFileNames: readonly string[] = [],
): Promise<FileDownloadSessionRecord> {
    const finalUrl = response.url === "" ? requestUrl.toString() : response.url;
    const resolvedFileName = resolveDownloadFileName({
        contentDisposition: response.headers.get("Content-Disposition"),
        contentType: response.headers.get("Content-Type"),
        requestedExtension: emptyStringToUndefined(sessionKey.requestedExtension),
        requestedName: emptyStringToUndefined(sessionKey.requestedName),
        responseUrl: finalUrl,
    });
    const id = Bun.randomUUIDv7();
    const plannedFinalFileName = await resolveAvailableFileName(
        sessionKey.outDirPath,
        resolvedFileName.baseName,
        resolvedFileName.extension,
    );
    const plannedFileParts = splitFileNameParts(plannedFinalFileName);

    return {
        entityTag: response.headers.get("ETag") ?? "",
        finalUrl,
        id,
        lastModified: response.headers.get("Last-Modified") ?? "",
        outDirPath: sessionKey.outDirPath,
        requestUrl: sessionKey.requestUrl,
        requestedExtension: sessionKey.requestedExtension,
        requestedName: sessionKey.requestedName,
        resolvedBaseName: resolvedFileName.baseName,
        resolvedExtension: resolvedFileName.extension ?? "",
        tempFileName: await resolveTemporaryDownloadFileName(
            sessionKey.outDirPath,
            plannedFileParts.baseName,
            reservedTempFileNames,
        ),
        totalBytes: parseContentLength(response.headers.get("Content-Length")),
        updatedAtMs: Date.now(),
    };
}

function updateDownloadSessionFromResumeResponse(
    session: FileDownloadSessionRecord,
    response: Response,
    totalBytes: number,
): FileDownloadSessionRecord {
    const finalUrl = response.url === "" ? session.finalUrl : response.url;

    return {
        ...session,
        entityTag: response.headers.get("ETag") ?? session.entityTag,
        finalUrl,
        lastModified: response.headers.get("Last-Modified") ?? session.lastModified,
        totalBytes,
        updatedAtMs: Date.now(),
    };
}

async function resolveTemporaryDownloadFileName(
    directoryPath: string,
    finalBaseName: string,
    reservedFileNames: readonly string[] = [],
): Promise<string> {
    const reservedFileNameSet = new Set(reservedFileNames);

    for (let index = 0; ; index += 1) {
        const temporaryBaseName = appendNumericSuffix(finalBaseName, index);
        const temporaryFileName = `${temporaryBaseName}.oodownload`;

        if (reservedFileNameSet.has(temporaryFileName)) {
            continue;
        }

        if (!(await pathExists(join(directoryPath, temporaryFileName)))) {
            return temporaryFileName;
        }
    }
}

function readResolvedFileName(
    session: FileDownloadSessionRecord,
): ResolvedDownloadFileName {
    return {
        baseName: session.resolvedBaseName,
        extension: emptyStringToUndefined(session.resolvedExtension),
    };
}

async function deleteDownloadSessionArtifacts(
    session: ExistingDownloadSession,
    sessionStore: Pick<CliExecutionContext["fileDownloadSessionStore"], "deleteDownloadSession">,
): Promise<void> {
    sessionStore.deleteDownloadSession(session.session.id);
    await rm(session.tempFilePath, {
        force: true,
    }).catch(() => undefined);
}

async function resolveAvailableFileName(
    directoryPath: string,
    baseName: string,
    extension?: string,
): Promise<string> {
    for (let index = 0; ; index += 1) {
        const candidateBaseName = appendNumericSuffix(baseName, index);
        const candidateFileName = buildFileName(candidateBaseName, extension);
        const candidatePath = join(directoryPath, candidateFileName);

        if (!(await pathExists(candidatePath))) {
            return candidateFileName;
        }
    }
}

async function openTemporaryDownloadFile(
    temporaryFilePath: string,
    mode: WriteDownloadPlan["mode"],
    expectedExistingBytes: number,
): Promise<DownloadFileHandle> {
    try {
        const fileHandle = await open(temporaryFilePath, mode === "append" ? "a" : "wx");

        if (mode === "append") {
            const metadata = await fileHandle.stat();

            if (metadata.size !== expectedExistingBytes) {
                await fileHandle.close().catch(() => undefined);

                throw createDownloadFailedError(
                    temporaryFilePath,
                    "The partial download changed before resume could continue.",
                );
            }
        }

        return fileHandle;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        throw createDownloadFailedError(
            temporaryFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
}

async function writeDownloadToTemporaryFile(
    response: Response,
    fileHandle: DownloadFileHandle,
    temporaryFilePath: string,
    progressReporter: DownloadProgressReporter | undefined,
    initialDownloadedBytes: number,
): Promise<number> {
    const reader = response.body?.getReader();
    let downloadedBytes = initialDownloadedBytes;

    try {
        progressReporter?.render(downloadedBytes);

        if (reader !== undefined) {
            while (true) {
                const chunk = await reader.read();

                if (chunk.done) {
                    break;
                }

                if (chunk.value.byteLength === 0) {
                    continue;
                }

                await writeChunk(fileHandle, chunk.value);
                downloadedBytes += chunk.value.byteLength;
                progressReporter?.render(downloadedBytes);
            }
        }

        await fileHandle.close();
        progressReporter?.complete(downloadedBytes);

        return downloadedBytes;
    }
    catch (error) {
        progressReporter?.finish(downloadedBytes);
        await fileHandle.close().catch(() => undefined);

        throw createDownloadFailedError(
            temporaryFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
    finally {
        reader?.releaseLock();
    }
}

async function writeChunk(
    fileHandle: DownloadFileHandle,
    chunk: Uint8Array,
): Promise<void> {
    let offset = 0;

    while (offset < chunk.byteLength) {
        const writeResult = await fileHandle.write(chunk.subarray(offset));

        offset += writeResult.bytesWritten;
    }
}

async function finalizeDownloadedFile(
    temporaryFilePath: string,
    directoryPath: string,
    baseName: string,
    extension?: string,
): Promise<string> {
    const resolvedFileName = await resolveAvailableFileName(
        directoryPath,
        baseName,
        extension,
    );
    const candidateFilePath = join(directoryPath, resolvedFileName);

    try {
        await link(temporaryFilePath, candidateFilePath);
        await unlink(temporaryFilePath);
        return candidateFilePath;
    }
    catch (error) {
        throw createDownloadFailedError(
            candidateFilePath,
            error instanceof Error ? error.message : String(error),
        );
    }
}

function createDownloadProgressReporter(
    writer: CliExecutionContext["stderr"],
    totalBytes: number | undefined,
): DownloadProgressReporter | undefined {
    if (writer.isTTY !== true) {
        return undefined;
    }

    return new DownloadProgressReporter(writer, totalBytes);
}

class DownloadProgressReporter {
    private hasRenderedLine = false;
    private lastRenderedAt = 0;
    private lastRenderedBytes = -1;
    private lastRenderedLine: string | undefined;

    constructor(
        private readonly writer: Pick<CliExecutionContext["stderr"], "write">,
        private readonly totalBytes: number | undefined,
    ) {}

    render(downloadedBytes: number): void {
        const now = Date.now();

        if (this.totalBytes !== undefined && downloadedBytes === this.totalBytes) {
            return;
        }

        if (
            downloadedBytes === this.lastRenderedBytes
            || (downloadedBytes !== this.totalBytes && now - this.lastRenderedAt < 100)
        ) {
            return;
        }

        this.lastRenderedBytes = downloadedBytes;
        this.lastRenderedAt = now;
        this.writeProgressLine(
            formatProgressLine(downloadedBytes, this.totalBytes),
        );
    }

    finish(downloadedBytes: number): void {
        this.lastRenderedBytes = downloadedBytes;
        this.lastRenderedAt = Date.now();
        this.writeProgressLine(
            formatProgressLine(downloadedBytes, this.totalBytes),
        );
    }

    complete(downloadedBytes: number): void {
        this.lastRenderedBytes = downloadedBytes;
        this.lastRenderedAt = Date.now();
        this.writeProgressLine(
            formatCompletedProgressLine(downloadedBytes, this.totalBytes),
        );
    }

    private writeProgressLine(line: string): void {
        if (this.hasRenderedLine && line === this.lastRenderedLine) {
            return;
        }

        if (!this.hasRenderedLine) {
            this.hasRenderedLine = true;
            this.lastRenderedLine = line;
            this.writer.write(`${line}\n`);
            return;
        }

        this.lastRenderedLine = line;
        this.writer.write(`\u001B[1A\r\u001B[2K${line}\n`);
    }
}

function formatProgressLine(
    downloadedBytes: number,
    totalBytes: number | undefined,
): string {
    return formatProgressStatusLine("Downloading", downloadedBytes, totalBytes);
}

function formatCompletedProgressLine(
    downloadedBytes: number,
    totalBytes: number | undefined,
): string {
    return formatProgressStatusLine("Downloaded", downloadedBytes, totalBytes);
}

function formatProgressStatusLine(
    status: "Downloaded" | "Downloading",
    downloadedBytes: number,
    totalBytes: number | undefined,
): string {
    if (totalBytes === undefined) {
        return `${status} ${formatByteCount(downloadedBytes)}`;
    }

    const percent = totalBytes === 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));

    return [
        status,
        formatByteCount(downloadedBytes),
        "/",
        formatByteCount(totalBytes),
        `(${percent}%)`,
    ].join(" ");
}

const byteCountUnits = ["B", "KB", "MB", "GB"] as const;

export function formatByteCount(value: number): string {
    let unitIndex = 0;
    let normalizedValue = value;

    while (
        normalizedValue >= 1024
        && unitIndex < byteCountUnits.length - 1
    ) {
        normalizedValue /= 1024;
        unitIndex += 1;
    }

    if (unitIndex === 0) {
        return `${value} B`;
    }

    const roundedValue = Math.round(normalizedValue * 10) / 10;

    return `${formatRoundedByteCount(roundedValue)} ${byteCountUnits[unitIndex]}`;
}

function formatRoundedByteCount(value: number): string {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function parseContentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }

    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
        return undefined;
    }

    return parsedValue;
}

function parseContentRange(value: string | null): ParsedContentRange | undefined {
    if (value === null) {
        return undefined;
    }

    const trimmedValue = value.trim();
    const spaceIndex = trimmedValue.indexOf(" ");

    if (spaceIndex <= 0 || trimmedValue.slice(0, spaceIndex).toLowerCase() !== "bytes") {
        return undefined;
    }

    const rangeValue = trimmedValue.slice(spaceIndex + 1);
    const slashIndex = rangeValue.indexOf("/");

    if (slashIndex <= 0) {
        return undefined;
    }

    const startEndValue = rangeValue.slice(0, slashIndex);
    const totalValue = rangeValue.slice(slashIndex + 1);
    const dashIndex = startEndValue.indexOf("-");

    if (dashIndex <= 0 || dashIndex === startEndValue.length - 1) {
        return undefined;
    }

    const start = parseSafeInteger(startEndValue.slice(0, dashIndex));
    const end = parseSafeInteger(startEndValue.slice(dashIndex + 1));
    const totalBytes = totalValue === "*" ? undefined : parseSafeInteger(totalValue);

    if (
        start === undefined
        || end === undefined
        || end < start
        || (totalBytes !== undefined && totalBytes <= end)
    ) {
        return undefined;
    }

    return {
        end,
        start,
        totalBytes,
    };
}

function parseSafeInteger(value: string): number | undefined {
    if (value === "") {
        return undefined;
    }

    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
        return undefined;
    }

    return parsedValue;
}

function buildFileName(baseName: string, extension?: string): string {
    return extension === undefined || extension === ""
        ? baseName
        : `${baseName}.${extension}`;
}

function appendNumericSuffix(value: string, index: number): string {
    return index === 0 ? value : `${value}_${index}`;
}

function hasPathSeparator(value: string): boolean {
    return value.includes("/") || value.includes("\\");
}

function emptyStringToUndefined(value: string): string | undefined {
    return value === "" ? undefined : value;
}

function createDownloadFailedError(
    path: string,
    message: string,
): CliUserError {
    return new CliUserError("errors.fileDownload.downloadFailed", 1, {
        message,
        path,
    });
}

async function pathExists(path: PathLike): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (isErrorCode(error, "ENOENT")) {
            return false;
        }

        throw error;
    }
}

function isErrorCode(error: unknown, code: string): boolean {
    return (
        error instanceof Error
        && "code" in error
        && error.code === code
    );
}
