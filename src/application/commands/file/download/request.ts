import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { FileDownloadSessionRecord } from "../../../contracts/file-download-session-store.ts";

import { CliUserError } from "../../../contracts/cli.ts";
import { withRequestTarget } from "../../../logging/log-fields.ts";

type DownloadRequestContext = Pick<CliExecutionContext, "fetcher" | "logger">;

export async function requestFreshDownload(
    requestUrl: URL,
    context: DownloadRequestContext,
): Promise<Response> {
    return requestFileDownload(requestUrl, context, {
        headers: buildRequestHeaders(),
    });
}

export async function requestResumeDownload(
    requestUrl: URL,
    context: DownloadRequestContext,
    localBytes: number,
    session: FileDownloadSessionRecord,
): Promise<Response> {
    return requestFileDownload(
        requestUrl,
        context,
        {
            headers: buildResumeRequestHeaders(localBytes, session),
        },
        [416],
    );
}

async function requestFileDownload(
    requestUrl: URL,
    context: DownloadRequestContext,
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
