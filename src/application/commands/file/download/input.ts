import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { CliUserError } from "../../../contracts/cli.ts";
import { expandHomeDirectoryPath } from "../../../path/home-directory.ts";
import { createOutputDirectoryError, isErrorCode } from "./errors.ts";

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

export function parseFileDownloadUrl(value: string): URL {
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

export async function ensureOutputDirectory(
    outDir: string | undefined,
    cwd: string,
    env: Record<string, string | undefined>,
): Promise<string> {
    const outputDirectoryPath = resolve(
        cwd,
        expandHomeDirectoryPath(outDir ?? ".", env),
    );
    let metadata: Awaited<ReturnType<typeof stat>> | undefined;

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

function hasPathSeparator(value: string): boolean {
    return value.includes("/") || value.includes("\\");
}
