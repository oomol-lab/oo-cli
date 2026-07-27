import type { CliExecutionContext } from "../../../contracts/cli.ts";
import type { FileDownloadSessionRecord } from "../../../contracts/file-download-session-store.ts";

import { requestOoResponse } from "../../shared/oo-request.ts";

type DownloadRequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;

export async function requestFreshDownload(
    requestUrl: URL,
    context: DownloadRequestContext,
): Promise<Response> {
    return requestFileDownload(requestUrl, context, buildRequestHeaders());
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
        buildResumeRequestHeaders(localBytes, session),
        [416],
    );
}

async function requestFileDownload(
    requestUrl: URL,
    context: DownloadRequestContext,
    headers: Record<string, string>,
    allowedStatuses: readonly number[] = [],
): Promise<Response> {
    const urlString = requestUrl.toString();

    return await requestOoResponse({
        allowedStatuses,
        context,
        errors: { scope: "fileDownload" },
        headers,
        host: { baseUrl: urlString },
        label: "File download",
        logFields: {
            start: {
                query: requestUrl.searchParams.toString(),
                url: urlString,
            },
            success: response => ({
                finalUrl: response.url === "" ? urlString : response.url,
                url: urlString,
            }),
        },
    });
}

function buildRequestHeaders(): Record<string, string> {
    return {
        "Accept-Encoding": "identity",
    };
}

function buildResumeRequestHeaders(
    localBytes: number,
    session: FileDownloadSessionRecord,
): Record<string, string> {
    const headers = buildRequestHeaders();

    headers.Range = `bytes=${localBytes}-`;

    const ifRangeValue = resolveIfRangeHeader(session);

    if (ifRangeValue !== undefined) {
        headers["If-Range"] = ifRangeValue;
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
