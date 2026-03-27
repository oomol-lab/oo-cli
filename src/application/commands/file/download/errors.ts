import { CliUserError } from "../../../contracts/cli.ts";

export function createOutputDirectoryError(
    outputDirectoryPath: string,
    error: unknown,
): CliUserError {
    return new CliUserError("errors.fileDownload.outDirCreateFailed", 1, {
        message: error instanceof Error ? error.message : String(error),
        path: outputDirectoryPath,
    });
}

export function createDownloadFailedError(
    path: string,
    message: string,
): CliUserError {
    return new CliUserError("errors.fileDownload.downloadFailed", 1, {
        message,
        path,
    });
}

export function isErrorCode(error: unknown, code: string): boolean {
    return (
        error instanceof Error
        && "code" in error
        && error.code === code
    );
}
