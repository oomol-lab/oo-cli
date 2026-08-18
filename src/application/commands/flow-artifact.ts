import type { Fetcher } from "../contracts/cli.ts";
import type { OpenFlowCommandRelease } from "./flow-release.ts";

import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { resolveHomeDirectory } from "../path/home-directory.ts";
import { acquireDownloadTempLock } from "../shared/download-temp-lock.ts";

const commandArtifactFormat = "open-flow-command-artifact";
const commandArtifactVersion = 2;
const commandArtifactManifestFile = "command-artifact.json";
const commandArtifactEntryFile = "entry.js";
const commandArchiveRoot = "open-flow-command";
const commandArchiveMediaType = "application/vnd.open-flow.command-artifact+tar+gzip";
const archivePrefix = `${commandArchiveRoot}/`;
const cacheFormatDirectory = "command-artifact-v2";
const tarBlockSize = 512;
const tarEndMarkerSize = tarBlockSize * 2;
const gzipHeaderSize = 10;
const gzipFooterSize = 8;
const lockWaitTimeoutMs = 300_000;
const commandArchiveDownloadTimeoutMs = 300_000;
const textDecoder = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: false,
});
const textEncoder = new TextEncoder();
const ustarMagic = textEncoder.encode("ustar\0");
const ustarVersion = textEncoder.encode("00");

interface CommandArtifactFile {
    readonly digest: string;
    readonly length: number;
    readonly path: string;
}

interface CommandArchiveEntry {
    readonly bytes: Uint8Array;
    readonly mode: number;
    readonly path: string;
}

const manifestFileSchema = z.object({
    digest: z.string().refine(isSha256Digest, "Command artifact file digest must be a lowercase SHA-256 digest."),
    length: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    path: z.string().refine(isNormalizedArtifactPath, "Command artifact file paths must be normalized relative paths."),
}).strict();

const commandArtifactManifestSchema = z.object({
    bunVersion: z.string().min(1),
    entry: z.literal(commandArtifactEntryFile),
    files: z.array(manifestFileSchema),
    format: z.literal(commandArtifactFormat),
    openFlowVersion: z.string().min(1),
    version: z.literal(commandArtifactVersion),
}).strict().superRefine((manifest, context) => {
    let previousPath: string | undefined;

    for (const [index, file] of manifest.files.entries()) {
        if (file.path === commandArtifactManifestFile) {
            context.addIssue({
                code: "custom",
                message: "The command artifact manifest cannot list itself.",
                path: ["files", index, "path"],
            });
        }

        if (
            previousPath !== undefined
            && compareArtifactPaths(previousPath, file.path) >= 0
        ) {
            context.addIssue({
                code: "custom",
                message: "Command artifact files must have unique paths in Unicode code-point order.",
                path: ["files", index, "path"],
            });
        }

        previousPath = file.path;
    }

    if (!manifest.files.some(file => file.path === commandArtifactEntryFile)) {
        context.addIssue({
            code: "custom",
            message: `Command artifact is missing required file ${JSON.stringify(commandArtifactEntryFile)}.`,
            path: ["files"],
        });
    }
});

type CommandArtifactManifest = z.infer<typeof commandArtifactManifestSchema>;

export async function installOpenFlowCommandRelease(
    release: OpenFlowCommandRelease,
    options: {
        env: Record<string, string | undefined>;
        execPath: string;
        fetcher: Fetcher;
        onDownloadProgress?: (downloadedBytes: number) => void;
        scheduleDownloadTimeout?: (
            onTimeout: () => void,
            timeoutMs: number,
        ) => () => void;
    },
): Promise<string> {
    if (release.bunVersion !== Bun.version) {
        invalid(`Open Flow requires Bun ${release.bunVersion}; received ${Bun.version}.`);
    }

    const cacheRoot = resolveOpenFlowCommandCacheRoot({
        env: options.env,
        platform: process.platform,
    });
    const commandDirectory = join(cacheRoot, release.archive.digest);

    if (await validCommandArtifactDirectory(commandDirectory, release)) {
        return commandDirectory;
    }

    await mkdir(cacheRoot, { recursive: true });
    const lockFilePath = join(cacheRoot, ".locks", `${release.archive.digest}.lock`);
    await mkdir(dirname(lockFilePath), { recursive: true });
    const sessionId = Bun.randomUUIDv7();
    const lock = await waitForArtifactLock({
        archiveName: basename(new URL(release.archive.url).pathname),
        execPath: options.execPath,
        lockFilePath,
        sessionId,
    });

    try {
        if (await validCommandArtifactDirectory(commandDirectory, release)) {
            return commandDirectory;
        }

        await rm(commandDirectory, { force: true, recursive: true });

        const temporaryId = `${process.pid}-${Bun.randomUUIDv7()}`;
        const archivePath = join(cacheRoot, `.archive-${temporaryId}.tar.gz`);
        const extractionDirectory = join(cacheRoot, `.extract-${temporaryId}`);

        try {
            await downloadCommandArchive(
                release,
                options.fetcher,
                archivePath,
                options.onDownloadProgress,
                options.scheduleDownloadTimeout ?? scheduleDownloadTimeout,
            );
            const archive = await readFile(archivePath);
            const decoded = decodeCommandArchive(archive, release);
            await writeCommandArtifactDirectory(extractionDirectory, decoded);
            await validateCommandArtifactDirectory(extractionDirectory, release);
            await rename(extractionDirectory, commandDirectory);
        }
        finally {
            await Promise.all([
                rm(archivePath, { force: true }),
                rm(extractionDirectory, { force: true, recursive: true }),
            ]);
        }

        return commandDirectory;
    }
    finally {
        await lock.close();
    }
}

async function waitForArtifactLock(options: {
    archiveName: string;
    execPath: string;
    lockFilePath: string;
    sessionId: string;
}): Promise<Extract<Awaited<ReturnType<typeof acquireDownloadTempLock>>, { status: "acquired" }>["handle"]> {
    const deadline = Date.now() + lockWaitTimeoutMs;

    while (Date.now() < deadline) {
        const result = await acquireDownloadTempLock({
            execPath: options.execPath,
            lockFilePath: options.lockFilePath,
            sessionId: options.sessionId,
            tempFileName: options.archiveName,
        });

        if (result.status === "acquired") {
            return result.handle;
        }

        await Bun.sleep(100);
    }

    invalid("Timed out waiting for another Open Flow command artifact installation.");
}

async function downloadCommandArchive(
    release: OpenFlowCommandRelease,
    fetcher: Fetcher,
    archivePath: string,
    onProgress: ((downloadedBytes: number) => void) | undefined,
    scheduleTimeout: (
        onTimeout: () => void,
        timeoutMs: number,
    ) => () => void,
): Promise<void> {
    onProgress?.(0);
    const abortController = new AbortController();
    const cancelTimeout = scheduleTimeout(() => {
        abortController.abort(new DOMException(
            "The operation was aborted due to timeout",
            "TimeoutError",
        ));
    }, commandArchiveDownloadTimeoutMs);

    try {
        const response = await fetcher(release.archive.url, {
            headers: {
                accept: commandArchiveMediaType,
            },
            signal: abortController.signal,
        });

        if (!response.ok) {
            invalid(`Open Flow command archive request failed with status ${response.status}.`);
        }

        const declaredLength = response.headers.get("content-length");

        if (declaredLength !== null) {
            const parsedLength = Number(declaredLength);

            if (
                !Number.isSafeInteger(parsedLength)
                || parsedLength < 0
                || parsedLength !== release.archive.length
            ) {
                invalid("Open Flow command archive response length does not match its release record.");
            }
        }

        if (response.body === null) {
            invalid("Open Flow command archive response has no body.");
        }

        const fileHandle = await open(archivePath, "wx");
        const digest = createHash("sha256");
        const reader = response.body.getReader();
        let length = 0;

        try {
            while (true) {
                const chunk = await reader.read();

                if (chunk.done) {
                    break;
                }

                if (length + chunk.value.byteLength > release.archive.length) {
                    invalid("Open Flow command archive is longer than its release record.");
                }

                let written = 0;

                while (written < chunk.value.byteLength) {
                    const result = await fileHandle.write(
                        chunk.value,
                        written,
                        chunk.value.byteLength - written,
                        length + written,
                    );

                    if (result.bytesWritten === 0) {
                        invalid("Open Flow command archive download stopped before completion.");
                    }

                    written += result.bytesWritten;
                }

                digest.update(chunk.value);
                length += chunk.value.byteLength;
                onProgress?.(length);
            }

            await fileHandle.sync();
        }
        finally {
            reader.releaseLock();
            await fileHandle.close();
        }

        if (length !== release.archive.length) {
            invalid("Open Flow command archive length does not match its release record.");
        }

        if (digest.digest("hex") !== release.archive.digest) {
            invalid("Open Flow command archive digest does not match its release record.");
        }
    }
    finally {
        cancelTimeout();
    }
}

function scheduleDownloadTimeout(
    onTimeout: () => void,
    timeoutMs: number,
): () => void {
    const timeoutId = setTimeout(onTimeout, timeoutMs);
    return () => clearTimeout(timeoutId);
}

function decodeCommandArchive(
    archive: Uint8Array,
    release: OpenFlowCommandRelease,
): readonly CommandArchiveEntry[] {
    const tar = decodeCanonicalGzip(archive);
    const files = decodeTar(tar);
    const manifestFile = files.find(file => file.path === commandArtifactManifestFile);

    if (manifestFile === undefined) {
        invalid(`Command archive is missing ${commandArtifactManifestFile}.`);
    }

    const manifest = decodeCommandArtifactManifest(manifestFile.bytes);
    validateManifestRelease(manifest, release);
    const payloadFiles = files.filter(file => file.path !== commandArtifactManifestFile);

    if (payloadFiles.length !== manifest.files.length) {
        invalid("Command archive file set does not match its manifest.");
    }

    for (const [index, file] of payloadFiles.entries()) {
        const expected = manifest.files[index];

        if (expected === undefined || file.path !== expected.path) {
            invalid("Command archive file set does not match its manifest.");
        }

        validateFile(file.bytes, expected);
    }

    return files;
}

function decodeCanonicalGzip(archive: Uint8Array): Uint8Array {
    if (
        archive.byteLength < gzipHeaderSize + gzipFooterSize
        || archive[0] !== 0x1F
        || archive[1] !== 0x8B
        || archive[2] !== 8
        || archive[3] !== 0
        || archive[4] !== 0
        || archive[5] !== 0
        || archive[6] !== 0
        || archive[7] !== 0
        || archive[8] !== 2
        || archive[9] !== 255
    ) {
        invalid("Command archive does not have the canonical gzip header.");
    }

    let tar: Uint8Array;

    try {
        tar = new Uint8Array(gunzipSync(archive));
    }
    catch (error) {
        throw new TypeError("Command archive gzip stream cannot be decoded.", {
            cause: error,
        });
    }

    return tar;
}

function decodeTar(tar: Uint8Array): readonly CommandArchiveEntry[] {
    if (tar.byteLength < tarEndMarkerSize || tar.byteLength % tarBlockSize !== 0) {
        invalid("Command archive is not a complete block-aligned tar stream.");
    }

    const files: CommandArchiveEntry[] = [];
    let offset = 0;
    let previousPath: string | undefined;

    while (offset < tar.byteLength) {
        if (zeroBytes(tar, offset, tarBlockSize)) {
            if (
                offset + tarEndMarkerSize !== tar.byteLength
                || !zeroBytes(tar, offset + tarBlockSize, tarBlockSize)
            ) {
                invalid("Command archive has an invalid tar end marker.");
            }

            return files;
        }

        validateTarChecksum(tar, offset);

        if (
            !sameBytes(tar.subarray(offset + 257, offset + 263), ustarMagic)
            || !sameBytes(tar.subarray(offset + 263, offset + 265), ustarVersion)
        ) {
            invalid("Command archive contains a non-USTAR entry.");
        }

        if (tar[offset + 156] !== 0x30) {
            invalid("Command archive contains a link, directory, device, metadata, or other non-file tar entry.");
        }

        const name = decodeTarText(tar, offset, 100, "name");
        const prefix = decodeTarText(tar, offset + 345, 155, "prefix");
        const archivePath = prefix === "" ? name : `${prefix}/${name}`;

        if (!archivePath.startsWith(archivePrefix)) {
            invalid(`Command archive entry is outside ${archivePrefix}.`);
        }

        const path = archivePath.slice(archivePrefix.length);

        if (!isNormalizedArtifactPath(path)) {
            invalid(`Command archive contains an invalid file path: ${archivePath}`);
        }

        if (
            previousPath !== undefined
            && compareArtifactPaths(previousPath, path) >= 0
        ) {
            invalid("Command archive paths are not sorted uniquely.");
        }

        const mode = decodeTarOctal(tar, offset + 100, 8, "mode");

        if (
            mode !== modeForArtifactPath(path)
            || decodeTarOctal(tar, offset + 108, 8, "uid") !== 0
            || decodeTarOctal(tar, offset + 116, 8, "gid") !== 0
            || decodeTarOctal(tar, offset + 136, 12, "mtime") !== 0
            || decodeTarText(tar, offset + 157, 100, "linkname") !== ""
            || decodeTarText(tar, offset + 265, 32, "uname") !== ""
            || decodeTarText(tar, offset + 297, 32, "gname") !== ""
            || decodeOptionalTarOctal(tar, offset + 329, 8, "devmajor") !== 0
            || decodeOptionalTarOctal(tar, offset + 337, 8, "devminor") !== 0
            || !zeroBytes(tar, offset + 500, 12)
        ) {
            invalid(`Command archive entry has invalid metadata: ${archivePath}`);
        }

        const size = decodeTarOctal(tar, offset + 124, 12, "size");
        const bodyStart = offset + tarBlockSize;
        const bodyEnd = bodyStart + size;
        const nextOffset = bodyStart + Math.ceil(size / tarBlockSize) * tarBlockSize;

        if (bodyEnd > tar.byteLength - tarEndMarkerSize || nextOffset > tar.byteLength - tarEndMarkerSize) {
            invalid(`Command archive contains a truncated file: ${archivePath}`);
        }

        if (!zeroBytes(tar, bodyEnd, nextOffset - bodyEnd)) {
            invalid(`Command archive file has non-zero tar padding: ${archivePath}`);
        }

        files.push({
            bytes: tar.subarray(bodyStart, bodyEnd),
            mode,
            path,
        });
        offset = nextOffset;
        previousPath = path;
    }

    invalid("Command archive is missing its tar end marker.");
}

function validateTarChecksum(tar: Uint8Array, offset: number): void {
    const expected = decodeTarOctal(tar, offset + 148, 8, "checksum");
    let actual = 0;

    for (let index = 0; index < tarBlockSize; index += 1) {
        actual += index >= 148 && index < 156
            ? 0x20
            : tar[offset + index] ?? 0;
    }

    if (actual !== expected) {
        invalid("Command archive contains a tar header with an invalid checksum.");
    }
}

function decodeTarText(
    tar: Uint8Array,
    offset: number,
    length: number,
    field: string,
): string {
    const bytes = tar.subarray(offset, offset + length);
    let end = bytes.indexOf(0);

    if (end < 0) {
        end = bytes.length;
    }
    else if (!zeroBytes(bytes, end, bytes.length - end)) {
        invalid(`Command archive contains a non-canonical tar ${field} field.`);
    }

    try {
        return textDecoder.decode(bytes.subarray(0, end));
    }
    catch (error) {
        throw new TypeError(`Command archive tar ${field} is not valid UTF-8.`, {
            cause: error,
        });
    }
}

function decodeTarOctal(
    tar: Uint8Array,
    offset: number,
    length: number,
    field: string,
): number {
    const bytes = tar.subarray(offset, offset + length);
    let digits = "";
    let terminated = false;

    for (const byte of bytes) {
        if (byte === 0 || byte === 0x20) {
            terminated = true;
            continue;
        }

        if (terminated || byte < 0x30 || byte > 0x37) {
            invalid(`Command archive contains a non-canonical tar ${field} field.`);
        }

        digits += String.fromCharCode(byte);
    }

    if (digits === "") {
        invalid(`Command archive contains an empty tar ${field} field.`);
    }

    const value = Number.parseInt(digits, 8);

    if (!Number.isSafeInteger(value)) {
        invalid(`Command archive contains an unsupported tar ${field} value.`);
    }

    return value;
}

function decodeOptionalTarOctal(
    tar: Uint8Array,
    offset: number,
    length: number,
    field: string,
): number {
    return zeroBytes(tar, offset, length)
        ? 0
        : decodeTarOctal(tar, offset, length, field);
}

function decodeCommandArtifactManifest(bytes: Uint8Array): CommandArtifactManifest {
    let source: string;

    try {
        source = textDecoder.decode(bytes);
    }
    catch (error) {
        throw new TypeError(`${commandArtifactManifestFile} is not valid UTF-8.`, {
            cause: error,
        });
    }

    let value: unknown;

    try {
        value = JSON.parse(source);
    }
    catch (error) {
        throw new TypeError(`${commandArtifactManifestFile} is not valid JSON.`, {
            cause: error,
        });
    }

    const result = commandArtifactManifestSchema.safeParse(value);

    if (!result.success) {
        throw new TypeError(`${commandArtifactManifestFile} is invalid.`, {
            cause: result.error,
        });
    }

    if (`${stringifyCanonicalJson(result.data)}\n` !== source) {
        invalid(`${commandArtifactManifestFile} is not canonical.`);
    }

    return result.data;
}

async function writeCommandArtifactDirectory(
    directory: string,
    files: readonly CommandArchiveEntry[],
): Promise<void> {
    await Promise.all(files.map(async (file) => {
        const path = join(directory, ...file.path.split("/"));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.bytes, { mode: file.mode });
    }));
}

async function validCommandArtifactDirectory(
    directory: string,
    release: OpenFlowCommandRelease,
): Promise<boolean> {
    try {
        await validateCommandArtifactDirectory(directory, release);
        return true;
    }
    catch {
        return false;
    }
}

async function validateCommandArtifactDirectory(
    directory: string,
    release: OpenFlowCommandRelease,
): Promise<void> {
    const manifest = decodeCommandArtifactManifest(
        await readFile(join(directory, commandArtifactManifestFile)),
    );
    validateManifestRelease(manifest, release);
    const actual = await collectArtifactDirectory(directory);
    const expectedFiles = [
        commandArtifactManifestFile,
        ...manifest.files.map(file => file.path),
    ].toSorted(compareArtifactPaths);
    const expectedDirectories = collectExpectedDirectories(expectedFiles);

    if (
        !sameStrings(actual.files, expectedFiles)
        || !sameStrings(actual.directories, expectedDirectories)
    ) {
        invalid("Command artifact cache file set does not match its manifest.");
    }

    await Promise.all(manifest.files.map(async (file) => {
        const bytes = await readFile(join(directory, ...file.path.split("/")));
        validateFile(bytes, file);
    }));
}

async function collectArtifactDirectory(
    directory: string,
    prefix = "",
): Promise<{ directories: string[]; files: string[] }> {
    const entries = await readdir(directory, { withFileTypes: true });
    const directories: string[] = [];
    const files: string[] = [];

    for (const entry of entries) {
        const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

        if (!isNormalizedArtifactPath(path)) {
            invalid(`Command artifact cache contains an invalid path: ${path}`);
        }

        if (entry.isFile()) {
            files.push(path);
            continue;
        }

        if (!entry.isDirectory()) {
            invalid(`Command artifact cache contains a non-file entry: ${path}`);
        }

        directories.push(path);
        const nested = await collectArtifactDirectory(
            join(directory, entry.name),
            path,
        );
        directories.push(...nested.directories);
        files.push(...nested.files);
    }

    return {
        directories: directories.toSorted(compareArtifactPaths),
        files: files.toSorted(compareArtifactPaths),
    };
}

function collectExpectedDirectories(files: readonly string[]): string[] {
    const directories = new Set<string>();

    for (const file of files) {
        const parts = file.split("/");

        for (let index = 1; index < parts.length; index += 1) {
            directories.add(parts.slice(0, index).join("/"));
        }
    }

    return [...directories].toSorted(compareArtifactPaths);
}

function validateManifestRelease(
    manifest: CommandArtifactManifest,
    release: OpenFlowCommandRelease,
): void {
    if (
        manifest.openFlowVersion !== release.openFlowVersion
        || manifest.bunVersion !== release.bunVersion
    ) {
        invalid("Command artifact manifest does not match its release record.");
    }
}

function validateFile(bytes: Uint8Array, expected: CommandArtifactFile): void {
    if (bytes.byteLength !== expected.length) {
        invalid(`Command artifact file length does not match its manifest: ${expected.path}`);
    }

    if (sha256(bytes) !== expected.digest) {
        invalid(`Command artifact file digest does not match its manifest: ${expected.path}`);
    }
}

export function resolveOpenFlowCommandCacheRoot(options: {
    env: Record<string, string | undefined>;
    homeDirectory?: string;
    platform: NodeJS.Platform;
}): string {
    const homeDirectory = resolveHomeDirectory(
        options.env,
        options.homeDirectory,
    );
    let platformCacheRoot: string;

    switch (options.platform) {
        case "darwin":
            platformCacheRoot = join(homeDirectory, "Library", "Caches");
            break;
        case "win32":
            platformCacheRoot = options.env.LOCALAPPDATA
                ?? join(homeDirectory, "AppData", "Local");
            break;
        default:
            platformCacheRoot = options.env.XDG_CACHE_HOME
                ?? join(homeDirectory, ".cache");
    }

    return join(platformCacheRoot, "oo", "open-flow", cacheFormatDirectory);
}

function isSha256Digest(value: string): boolean {
    if (value.length !== 64) {
        return false;
    }

    for (const character of value) {
        if (
            !(character >= "0" && character <= "9")
            && !(character >= "a" && character <= "f")
        ) {
            return false;
        }
    }

    return true;
}

function isNormalizedArtifactPath(path: string): boolean {
    if (
        path === ""
        || !path.isWellFormed()
        || path.startsWith("/")
        || path.includes("\\")
        || path.includes("\0")
    ) {
        return false;
    }

    const first = path[0];

    if (
        first !== undefined
        && path[1] === ":"
        && path[2] === "/"
        && ((first >= "A" && first <= "Z") || (first >= "a" && first <= "z"))
    ) {
        return false;
    }

    return path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

function compareArtifactPaths(left: string, right: string): number {
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
        const leftCodePoint = left.codePointAt(leftIndex);
        const rightCodePoint = right.codePointAt(rightIndex);

        if (leftCodePoint === undefined || rightCodePoint === undefined) {
            break;
        }

        if (leftCodePoint !== rightCodePoint) {
            return leftCodePoint < rightCodePoint ? -1 : 1;
        }

        leftIndex += leftCodePoint > 0xFFFF ? 2 : 1;
        rightIndex += rightCodePoint > 0xFFFF ? 2 : 1;
    }

    return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0;
}

function stringifyCanonicalJson(value: unknown): string {
    if (value === null || typeof value === "boolean" || typeof value === "string") {
        return JSON.stringify(value);
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            invalid("Command artifact manifests cannot contain non-finite numbers.");
        }

        return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stringifyCanonicalJson).join(",")}]`;
    }

    if (typeof value === "object") {
        return `{${Object.keys(value)
            .toSorted(compareArtifactPaths)
            .map(key => `${JSON.stringify(key)}:${stringifyCanonicalJson(Reflect.get(value, key))}`)
            .join(",")}}`;
    }

    invalid(`Command artifact manifests cannot contain ${typeof value} values.`);
}

function modeForArtifactPath(path: string): number {
    return path === commandArtifactEntryFile ? 0o755 : 0o644;
}

function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength
        && left.every((byte, index) => byte === right[index]);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length
        && left.every((value, index) => value === right[index]);
}

function zeroBytes(bytes: Uint8Array, offset: number, length: number): boolean {
    for (let index = offset; index < offset + length; index += 1) {
        if (bytes[index] !== 0) {
            return false;
        }
    }

    return true;
}

function invalid(message: string): never {
    throw new TypeError(message);
}
