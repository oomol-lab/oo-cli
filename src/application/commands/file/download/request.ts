import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { FileDownloadSessionRecord } from "../../../contracts/file-download-session-store.ts";

import { CliUserError } from "../../../contracts/cli.ts";
import { performLoggedRequest } from "../../shared/request.ts";

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
    return await performLoggedRequest({
        allowedStatuses,
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.fileDownload.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.fileDownload.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            error: {
                method: "GET",
                url: requestUrl.toString(),
            },
            response: {
                method: "GET",
                url: requestUrl.toString(),
            },
            start: {
                method: "GET",
                query: requestUrl.searchParams.toString(),
                url: requestUrl.toString(),
            },
            success: response => ({
                finalUrl: response.url === "" ? requestUrl.toString() : response.url,
            }),
        },
        init,
        requestLabel: "File download",
        requestUrl,
    });
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
