import type { FileDownloadSessionRecord } from "../../../contracts/file-download-session-store.ts";
import type { ResolvedDownloadFileName } from "../file-name-utils.ts";

export interface ExistingDownloadSession {
    localBytes: number;
    session: FileDownloadSessionRecord;
    tempFilePath: string;
}

export interface WriteDownloadPlan {
    initialBytes: number;
    kind: "write-response";
    mode: "append" | "fresh";
    resolvedFileName: ResolvedDownloadFileName;
    response: Response;
    session: FileDownloadSessionRecord;
    tempFilePath: string;
    totalBytes?: number;
}

export interface FinalizeDownloadPlan {
    kind: "finalize-existing";
    resolvedFileName: ResolvedDownloadFileName;
    session: FileDownloadSessionRecord;
    tempFilePath: string;
}

export type DownloadPlan = FinalizeDownloadPlan | WriteDownloadPlan;

export interface ParsedContentRange {
    end: number;
    start: number;
    totalBytes?: number;
}
