import { Buffer } from "node:buffer";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { ZipFile } from "yazl";
import { CliUserError } from "../../contracts/cli.ts";
import { isPathMissingError } from "../../shared/fs-errors.ts";
import { formatFileSize } from "../shared/file-size.ts";

// Packs a built static site for upload. The limits match the service's own,
// so an oversized site is refused before anything is uploaded.
const maxZipBytes = 52_428_800;
const maxFiles = 5_000;
const ignoredFileNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const ignoredDirectoryNames = new Set([".git"]);

interface SiteFile {
    absolute: string;
    /** Path inside the zip, always with forward slashes. */
    relative: string;
}

export async function collectSiteFiles(root: string): Promise<SiteFile[]> {
    const rootStat = await stat(root).catch((error: unknown) => {
        if (isPathMissingError(error)) {
            return undefined;
        }

        throw error;
    });

    if (rootStat?.isDirectory() !== true) {
        throw new CliUserError("errors.spaces.dirNotFound", 2, { path: root });
    }

    const files: SiteFile[] = [];
    const walk = async (current: string): Promise<void> => {
        const entries = await readdir(current, { withFileTypes: true });

        // A stable order makes the zip of an unchanged site byte-identical.
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

        for (const entry of entries) {
            const absolute = join(current, entry.name);
            const info = await lstat(absolute);

            if (info.isSymbolicLink()) {
                throw new CliUserError("errors.spaces.symlinkNotSupported", 2, { path: absolute });
            }

            if (info.isDirectory()) {
                if (!ignoredDirectoryNames.has(entry.name)) {
                    await walk(absolute);
                }

                continue;
            }

            if (!info.isFile() || ignoredFileNames.has(entry.name)) {
                continue;
            }

            files.push({ absolute, relative: relative(root, absolute).split(sep).join("/") });

            if (files.length > maxFiles) {
                throw new CliUserError("errors.spaces.tooManyFiles", 1, { max: maxFiles });
            }
        }
    };

    await walk(root);

    if (!files.some(file => file.relative === "index.html")) {
        throw new CliUserError("errors.spaces.indexHtmlMissing", 1, { path: root });
    }

    return files;
}

export async function packDirectory(
    root: string,
    maxBytes: number = maxZipBytes,
): Promise<{ fileCount: number; zip: Uint8Array }> {
    const files = await collectSiteFiles(root);
    const zip = await new Promise<Uint8Array>((resolve, reject) => {
        const archive = new ZipFile();
        let chunks: Buffer[] = [];
        let byteLength = 0;

        // Past the limit the archive is only measured, for the error message,
        // and no longer kept: an oversized site must not exhaust memory.
        archive.outputStream.on("data", (chunk: Buffer) => {
            byteLength += chunk.byteLength;

            if (byteLength > maxBytes) {
                chunks = [];
            }
            else {
                chunks.push(chunk);
            }
        });
        archive.outputStream.on("error", reject);
        archive.outputStream.on("end", () => {
            try {
                assertZipSize(byteLength, maxBytes);
                resolve(new Uint8Array(Buffer.concat(chunks)));
            }
            catch (error) {
                reject(error);
            }
        });

        for (const file of files) {
            archive.addFile(file.absolute, file.relative, { mode: 0o644 });
        }

        archive.end();
    });

    return { fileCount: files.length, zip };
}

export async function readZipFile(path: string, maxBytes: number = maxZipBytes): Promise<Uint8Array> {
    const throwNotFound = (error: unknown): never => {
        if (isPathMissingError(error)) {
            throw new CliUserError("errors.spaces.zipNotFound", 2, { path });
        }

        throw error;
    };

    // The size is checked before the file is read, so an oversized file is
    // refused without loading it, and again on what was actually read.
    assertZipSize((await stat(path).catch(throwNotFound)).size, maxBytes);

    const bytes = await readFile(path).catch(throwNotFound);

    assertZipSize(bytes.byteLength, maxBytes);

    // Only the magic number is checked here; the service validates the structure.
    if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
        throw new CliUserError("errors.spaces.notAZip", 1, { path });
    }

    return new Uint8Array(bytes);
}

function assertZipSize(byteLength: number, maxBytes: number): void {
    if (byteLength > maxBytes) {
        throw new CliUserError("errors.spaces.siteTooLarge", 1, {
            max: formatFileSize(maxBytes),
            size: formatFileSize(byteLength),
        });
    }
}
