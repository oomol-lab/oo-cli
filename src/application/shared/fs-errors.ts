function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error
        && "code" in error
        && error.code === code;
}

export function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
    return hasErrorCode(error, "ENOENT");
}

export function isPathMissingError(error: unknown): error is NodeJS.ErrnoException {
    return isFileMissingError(error) || hasErrorCode(error, "ENOTDIR");
}

export function isFileAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
    return hasErrorCode(error, "EEXIST");
}

export function isDirectoryReadError(error: unknown): error is NodeJS.ErrnoException {
    return hasErrorCode(error, "EISDIR");
}

export function isProcessMissingError(error: unknown): error is NodeJS.ErrnoException {
    return hasErrorCode(error, "ESRCH");
}
