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

export async function packDirectory(root: string): Promise<{ fileCount: number; zip: Uint8Array }> {
    const files = await collectSiteFiles(root);
    const zip = await new Promise<Uint8Array>((resolve, reject) => {
        const archive = new ZipFile();
        const chunks: Buffer[] = [];

        archive.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
        archive.outputStream.on("error", reject);
        archive.outputStream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));

        for (const file of files) {
            archive.addFile(file.absolute, file.relative, { mode: 0o644 });
        }

        archive.end();
    });

    assertZipSize(zip.byteLength);

    return { fileCount: files.length, zip };
}

export async function readZipFile(path: string): Promise<Uint8Array> {
    const bytes = await readFile(path).catch((error: unknown) => {
        if (isPathMissingError(error)) {
            throw new CliUserError("errors.spaces.zipNotFound", 2, { path });
        }

        throw error;
    });

    assertZipSize(bytes.byteLength);

    // Only the magic number is checked here; the service validates the structure.
    if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
        throw new CliUserError("errors.spaces.notAZip", 1, { path });
    }

    return new Uint8Array(bytes);
}

function assertZipSize(byteLength: number): void {
    if (byteLength > maxZipBytes) {
        throw new CliUserError("errors.spaces.siteTooLarge", 1, {
            max: formatFileSize(maxZipBytes),
            size: formatFileSize(byteLength),
        });
    }
}
