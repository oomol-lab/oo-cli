function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error
        && "code" in error
        && error.code === code;
}

export function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
    return hasErrorCode(error, "ENOENT");
}

export function isFileAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
    return hasErrorCode(error, "EEXIST");
}
