import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { FileDownloadSessionKey } from "../../../contracts/file-download-session-store.ts";
import type {
    DownloadPlan,
    ExistingDownloadSession,
    ParsedContentRange,
    WriteDownloadPlan,
} from "./types.ts";

import { deleteDownloadSessionArtifacts } from "./file-system.ts";
import { requestFreshDownload, requestResumeDownload } from "./request.ts";
import {
    createWriteDownloadPlanFromResponse,
    loadExistingDownloadSession,
    parseContentRange,
    readResolvedFileName,
    saveDownloadSessionBestEffort,
    updateDownloadSessionFromResumeResponse,
} from "./session.ts";

type DownloadPlanContext = Pick<
    CliExecutionContext,
    "execPath" | "fetcher" | "fileDownloadSessionStore" | "logger" | "translator"
>;

export async function resolveDownloadPlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    context: DownloadPlanContext,
): Promise<DownloadPlan> {
    const existingSession = await loadExistingDownloadSession(
        sessionKey,
        context,
    );

    if (existingSession === undefined) {
        return createFreshDownloadPlan(requestUrl, sessionKey, context);
    }

    if (isExistingSessionComplete(existingSession)) {
        return createFinalizeExistingPlan(existingSession);
    }

    const resumeResponse = await requestResumeDownload(
        requestUrl,
        context,
        existingSession.localBytes,
        existingSession.session,
    );

    if (resumeResponse.status === 206) {
        return resolvePartialContentResumePlan(
            requestUrl,
            sessionKey,
            existingSession,
            resumeResponse,
            context,
        );
    }

    if (resumeResponse.status === 416) {
        return resolveRangeNotSatisfiablePlan(
            requestUrl,
            sessionKey,
            existingSession,
            context,
        );
    }

    return restartDownloadPlan(
        requestUrl,
        sessionKey,
        existingSession,
        context,
        resumeResponse,
    );
}

async function createFreshDownloadPlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    context: DownloadPlanContext,
    reservedTempFileNames: readonly string[] = [],
): Promise<WriteDownloadPlan> {
    const response = await requestFreshDownload(requestUrl, context);

    return createWriteDownloadPlanFromResponse(
        requestUrl,
        sessionKey,
        response,
        {
            execPath: context.execPath,
            logger: context.logger,
            sessionStore: context.fileDownloadSessionStore,
        },
        reservedTempFileNames,
    );
}

function createFinalizeExistingPlan(
    existingSession: ExistingDownloadSession,
): DownloadPlan {
    return {
        kind: "finalize-existing",
        resolvedFileName: readResolvedFileName(existingSession.session),
        session: existingSession.session,
        tempLock: existingSession.tempLock,
        tempFilePath: existingSession.tempFilePath,
    };
}

async function resolvePartialContentResumePlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    existingSession: ExistingDownloadSession,
    response: Response,
    context: DownloadPlanContext,
): Promise<DownloadPlan> {
    const contentRange = parseContentRange(
        response.headers.get("Content-Range"),
    );

    if (!isCompatibleResumeRange(existingSession, contentRange)) {
        return restartDownloadPlan(
            requestUrl,
            sessionKey,
            existingSession,
            context,
        );
    }

    const resumedSession = updateDownloadSessionFromResumeResponse(
        existingSession.session,
        response,
        contentRange.totalBytes,
    );

    await saveDownloadSessionBestEffort(
        resumedSession,
        context.fileDownloadSessionStore,
        context.logger,
    );

    return {
        initialBytes: existingSession.localBytes,
        kind: "write-response",
        mode: "append",
        resolvedFileName: readResolvedFileName(resumedSession),
        response,
        session: resumedSession,
        tempLock: existingSession.tempLock,
        tempFilePath: existingSession.tempFilePath,
        totalBytes: contentRange.totalBytes,
    };
}

function resolveRangeNotSatisfiablePlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    existingSession: ExistingDownloadSession,
    context: DownloadPlanContext,
): DownloadPlan | Promise<DownloadPlan> {
    if (isExistingSessionComplete(existingSession)) {
        return createFinalizeExistingPlan(existingSession);
    }

    return restartDownloadPlan(
        requestUrl,
        sessionKey,
        existingSession,
        context,
    );
}

async function restartDownloadPlan(
    requestUrl: URL,
    sessionKey: FileDownloadSessionKey,
    existingSession: ExistingDownloadSession,
    context: DownloadPlanContext,
    response?: Response,
): Promise<WriteDownloadPlan> {
    try {
        await deleteDownloadSessionArtifacts(
            existingSession,
            context.fileDownloadSessionStore,
        );
    }
    finally {
        await existingSession.tempLock.close();
    }

    if (response !== undefined) {
        return createWriteDownloadPlanFromResponse(
            requestUrl,
            sessionKey,
            response,
            {
                execPath: context.execPath,
                logger: context.logger,
                sessionStore: context.fileDownloadSessionStore,
            },
            [existingSession.session.tempFileName],
        );
    }

    return createFreshDownloadPlan(
        requestUrl,
        sessionKey,
        context,
        [existingSession.session.tempFileName],
    );
}

function isExistingSessionComplete(existingSession: ExistingDownloadSession): boolean {
    return (
        existingSession.session.totalBytes !== undefined
        && existingSession.localBytes === existingSession.session.totalBytes
    );
}

function isCompatibleResumeRange(
    existingSession: ExistingDownloadSession,
    contentRange: ParsedContentRange | undefined,
): contentRange is ParsedContentRange & { totalBytes: number } {
    if (contentRange === undefined || contentRange.totalBytes === undefined) {
        return false;
    }

    if (contentRange.start !== existingSession.localBytes) {
        return false;
    }

    return (
        existingSession.session.totalBytes === undefined
        || contentRange.totalBytes === existingSession.session.totalBytes
    );
}
