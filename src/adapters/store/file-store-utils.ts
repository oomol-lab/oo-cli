export function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "ENOENT",
    );
}

export function isFileAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "EEXIST",
    );
}
