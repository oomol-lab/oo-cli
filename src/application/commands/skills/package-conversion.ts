import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, join, posix, relative, sep } from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";
import matter from "gray-matter";
import { CliUserError } from "../../contracts/cli.ts";
import { isSemver } from "../../semver.ts";
import { isFileMissingError } from "../../shared/fs-errors.ts";
import { getUnexpectedRequestErrorMessage } from "../shared/request.ts";
import {
    skillPackageGitAttributesTemplate,
    skillPackageGitIgnoreTemplate,
} from "./package-templates.ts";
import { removeManagedOoSkillArtifacts } from "./registry-skill-markdown.ts";
import { renderSkillTitle } from "./skill-title.ts";

export interface ConvertSkillPackageOptions {
    packageName: string;
    packageRootDirectoryPath: string;
    skillDirectoryPath: string;
    skillId: string;
    version: string;
}

export interface ConvertSkillPackageResult {
    packageName: string;
    packageRootDirectoryPath: string;
    skillId: string;
    version: string;
}

export interface LocalSkillPackageMetadata {
    description: string;
    displayName: string;
    icon?: string;
    requestedVersion: string;
    skillId: string;
}

export interface PublishConvertedSkillPackageOptions {
    account: Pick<AuthAccount, "apiKey" | "endpoint">;
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
    packageRootDirectoryPath: string;
    visibility: SkillPublishVisibility;
}

interface PackageMetadataFile {
    description: string;
    displayName: string;
    icon?: string;
    name: string;
    version: string;
}

interface PublishManifest {
    description?: string;
    dist?: Record<string, unknown>;
    files?: unknown;
    name: string;
    private?: boolean;
    version: string;
    [key: string]: unknown;
}

interface TarEntry {
    absolutePath: string;
    archivePath: string;
    kind: "directory" | "file";
}

const defaultRequestedPackageVersion = "0.0.1";
export const skillPublishVisibilityValues = ["private", "public"] as const;
export type SkillPublishVisibility = (typeof skillPublishVisibilityValues)[number];
export const defaultSkillPublishVisibility: SkillPublishVisibility = "private";

const skillPackageFiles = [
    "package/.gitattributes",
    "package/.gitignore",
    "package/package.oo.yaml",
    "package/skills",
    "package/.oo-thumbnail.json",
    "package/.oo-thumbnail.zh-CN.json",
] as const;
const localOnlyPackagePathNames: ReadonlySet<string> = new Set([
    ".ds_store",
    ".env",
    ".envrc",
    ".git",
    ".hg",
    ".npmrc",
    ".oo-metadata.json",
    ".svn",
    "desktop.ini",
    "thumbs.db",
]);
const tarBlockSize = 512;
const tarHeaderSize = 512;
const npmCompatiblePublishUserAgent = `npm/10.0.0 node/${process.version} ${process.platform} ${process.arch}`;

export async function convertSkillDirectoryToPackage(
    options: ConvertSkillPackageOptions,
): Promise<ConvertSkillPackageResult> {
    validateResolvedPackageMetadata(options);

    const skillMetadata = await readLocalSkillPackageMetadata({
        skillDirectoryPath: options.skillDirectoryPath,
        skillId: options.skillId,
    });
    const packageMetadata: PackageMetadataFile = {
        description: skillMetadata.description,
        displayName: skillMetadata.displayName,
        icon: skillMetadata.icon,
        name: options.packageName,
        version: options.version,
    };
    const packageDirectoryPath = join(options.packageRootDirectoryPath, "package");
    const packageSkillsDirectoryPath = join(packageDirectoryPath, "skills");
    const packageSkillDirectoryPath = join(
        packageSkillsDirectoryPath,
        options.skillId,
    );

    await rm(packageDirectoryPath, { force: true, recursive: true });
    await mkdir(packageSkillsDirectoryPath, { recursive: true });
    await cp(options.skillDirectoryPath, packageSkillDirectoryPath, {
        filter: (sourcePath) => {
            const sourceRelativePath = relative(options.skillDirectoryPath, sourcePath);

            return sourceRelativePath === ""
                || !isLocalOnlyPackagePath(sourceRelativePath);
        },
        force: true,
        recursive: true,
    });
    await removeManagedOoArtifactsFromSkillFile(
        join(packageSkillDirectoryPath, "SKILL.md"),
    );

    await Promise.all([
        Bun.write(
            join(options.packageRootDirectoryPath, "package.json"),
            renderPackageJson(packageMetadata),
        ),
        Bun.write(
            join(packageDirectoryPath, ".gitattributes"),
            skillPackageGitAttributesTemplate,
        ),
        Bun.write(
            join(packageDirectoryPath, ".gitignore"),
            skillPackageGitIgnoreTemplate,
        ),
        Bun.write(
            join(packageDirectoryPath, "package.oo.yaml"),
            renderOoPackageYaml(packageMetadata),
        ),
    ]);

    return {
        packageName: options.packageName,
        packageRootDirectoryPath: options.packageRootDirectoryPath,
        skillId: options.skillId,
        version: options.version,
    };
}

export async function readLocalSkillPackageMetadata(
    options: {
        skillDirectoryPath: string;
        skillId: string;
    },
): Promise<LocalSkillPackageMetadata> {
    const skillFilePath = join(options.skillDirectoryPath, "SKILL.md");
    const parsed = await readSkillMarkdownMatter(skillFilePath);
    const frontmatter = parsed.data;
    const metadata = frontmatter.metadata;

    if (metadata !== undefined && !isPlainRecord(metadata)) {
        throw createInvalidSkillFileError(
            skillFilePath,
            "Frontmatter metadata must be an object.",
        );
    }

    const name = readRequiredFrontmatterString(
        frontmatter.name,
        "name",
        skillFilePath,
    );

    if (name !== options.skillId) {
        throw createInvalidSkillFileError(
            skillFilePath,
            `Frontmatter name ${JSON.stringify(name)} must match skill id ${JSON.stringify(options.skillId)}.`,
        );
    }

    const description = readRequiredFrontmatterString(
        frontmatter.description,
        "description",
        skillFilePath,
    );
    const title = readOptionalFrontmatterString(
        metadata?.title,
        "metadata.title",
        skillFilePath,
    );
    const icon = readOptionalFrontmatterString(
        metadata?.icon,
        "metadata.icon",
        skillFilePath,
    );
    readOptionalFrontmatterString(
        metadata?.packageName,
        "metadata.packageName",
        skillFilePath,
    );

    const requestedVersion = readOptionalFrontmatterString(
        metadata?.version,
        "metadata.version",
        skillFilePath,
    ) ?? defaultRequestedPackageVersion;

    if (!isSemver(requestedVersion)) {
        throw createInvalidSkillFileError(
            skillFilePath,
            "Frontmatter metadata.version field must be a valid semver string if provided.",
        );
    }

    return {
        description,
        displayName: title ?? renderSkillTitle(options.skillId),
        icon,
        requestedVersion,
        skillId: options.skillId,
    };
}

export async function writePublishedSkillMetadata(
    options: {
        packageName: string;
        skillDirectoryPath: string;
        version: string;
    },
): Promise<void> {
    if (!isNonBlankString(options.packageName)) {
        throw new CliUserError("errors.skills.publish.invalidPackageMetadata", 1, {
            message: "Package name must be a non-empty string.",
        });
    }

    if (!isSemver(options.version)) {
        throw new CliUserError("errors.skills.publish.invalidPackageMetadata", 1, {
            message: "Package version must be a valid semver string.",
        });
    }

    const skillFilePath = join(options.skillDirectoryPath, "SKILL.md");
    const parsed = await readSkillMarkdownMatter(skillFilePath);
    const metadata = parsed.data.metadata;

    if (metadata !== undefined && !isPlainRecord(metadata)) {
        throw createInvalidSkillFileError(
            skillFilePath,
            "Frontmatter metadata must be an object.",
        );
    }

    const nextFrontmatter = {
        ...parsed.data,
        metadata: {
            ...(metadata ?? {}),
            packageName: options.packageName,
            version: options.version,
        },
    };

    await Bun.write(
        skillFilePath,
        matter.stringify(parsed.content, nextFrontmatter),
    );
}

export async function publishConvertedSkillPackage(
    options: PublishConvertedSkillPackageOptions,
): Promise<void> {
    const manifest = await readPublishManifest(options.packageRootDirectoryPath);
    const tarballBytes = await packPackageRoot(
        options.packageRootDirectoryPath,
        manifest,
    );
    const registry = createOoRegistryBaseUrl(options.account.endpoint);
    const metadata = createPublishMetadata(
        manifest,
        tarballBytes,
        registry,
        options.visibility,
    );
    const requestUrl = createPublishRequestUrl(registry, manifest.name);

    options.context.logger.debug(
        {
            packageName: manifest.name,
            packageVersion: manifest.version,
            target: requestUrl.href,
        },
        "Skill package publish request started.",
    );

    const response = await requestSkillPackagePublish({
        apiKey: options.account.apiKey,
        body: JSON.stringify(metadata),
        context: options.context,
        packageName: manifest.name,
        packageVersion: manifest.version,
        requestUrl,
    });

    options.context.logger.debug(
        {
            packageName: manifest.name,
            packageVersion: manifest.version,
            status: response.status,
            target: requestUrl.href,
        },
        "Skill package publish request completed.",
    );
}

async function readPublishManifest(
    packageRootDirectoryPath: string,
): Promise<PublishManifest> {
    let parsed: unknown;

    try {
        parsed = JSON.parse(
            await readFile(join(packageRootDirectoryPath, "package.json"), "utf8"),
        ) as unknown;
    }
    catch (error) {
        throw new CliUserError("errors.skills.publish.invalidPackageMetadata", 1, {
            message: `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`,
        });
    }

    if (!isPlainRecord(parsed)) {
        throw createInvalidPackageMetadataError("package.json must contain a JSON object.");
    }

    const name = parsed.name;
    const version = parsed.version;

    if (!isNonBlankString(name)) {
        throw createInvalidPackageMetadataError("Package name must be a non-empty string.");
    }

    if (typeof version !== "string" || !isSemver(version)) {
        throw createInvalidPackageMetadataError(
            "Package version must be a valid semver string.",
        );
    }

    if (parsed.private === true) {
        throw createInvalidPackageMetadataError("Cannot publish a private package.");
    }

    if (parsed.files !== undefined && !Array.isArray(parsed.files)) {
        throw createInvalidPackageMetadataError(
            "Package files field must be an array if provided.",
        );
    }

    return {
        ...parsed,
        name,
        version,
    };
}

async function packPackageRoot(
    packageRootDirectoryPath: string,
    manifest: PublishManifest,
): Promise<Uint8Array> {
    const entries = await collectTarEntries(packageRootDirectoryPath, manifest);

    if (entries.length === 0) {
        throw createInvalidPackageMetadataError("Package tarball must not be empty.");
    }

    const blocks: Buffer[] = [];

    for (const entry of entries) {
        if (entry.kind === "directory") {
            blocks.push(createTarHeader({
                path: ensureTarDirectoryPath(entry.archivePath),
                size: 0,
                type: "5",
            }));
            continue;
        }

        const content = Buffer.from(await readFile(entry.absolutePath));

        blocks.push(createTarHeader({
            path: entry.archivePath,
            size: content.length,
            type: "0",
        }));
        blocks.push(content, createTarPadding(content.length));
    }

    blocks.push(Buffer.alloc(tarBlockSize * 2));

    return gzipSync(Buffer.concat(blocks));
}

async function collectTarEntries(
    packageRootDirectoryPath: string,
    manifest: PublishManifest,
): Promise<TarEntry[]> {
    const entries = new Map<string, TarEntry>();

    await collectExistingPath(packageRootDirectoryPath, "package.json", entries);

    for (const filePath of readManifestFilePaths(manifest)) {
        await collectExistingPath(packageRootDirectoryPath, filePath, entries);
    }

    return [...entries.values()].sort(compareTarEntries);
}

function compareTarEntries(left: TarEntry, right: TarEntry): number {
    if (left.archivePath === right.archivePath) {
        return 0;
    }

    return left.archivePath < right.archivePath ? -1 : 1;
}

function readManifestFilePaths(manifest: PublishManifest): string[] {
    if (manifest.files === undefined) {
        return [];
    }

    if (!Array.isArray(manifest.files)) {
        return [];
    }

    return manifest.files.filter(isNonBlankString);
}

async function collectExistingPath(
    packageRootDirectoryPath: string,
    relativePath: string,
    entries: Map<string, TarEntry>,
): Promise<void> {
    const safeRelativePath = resolveSafePackageRelativePath(relativePath);

    if (isLocalOnlyPackagePath(safeRelativePath)) {
        return;
    }

    const absolutePath = join(packageRootDirectoryPath, safeRelativePath);
    let metadata: Awaited<ReturnType<typeof stat>>;

    try {
        metadata = await stat(absolutePath);
    }
    catch (error) {
        if (isFileMissingError(error)) {
            return;
        }

        throw error;
    }

    const archivePath = createArchivePath(safeRelativePath);

    if (metadata.isDirectory()) {
        entries.set(ensureTarDirectoryPath(archivePath), {
            absolutePath,
            archivePath,
            kind: "directory",
        });
        await collectDirectoryEntries(packageRootDirectoryPath, absolutePath, entries);
        return;
    }

    if (metadata.isFile()) {
        entries.set(archivePath, {
            absolutePath,
            archivePath,
            kind: "file",
        });
    }
}

async function collectDirectoryEntries(
    packageRootDirectoryPath: string,
    directoryPath: string,
    entries: Map<string, TarEntry>,
): Promise<void> {
    const dirents = await readdir(directoryPath, { withFileTypes: true });

    await Promise.all(
        dirents.map(dirent =>
            collectExistingPath(
                packageRootDirectoryPath,
                relative(packageRootDirectoryPath, join(directoryPath, dirent.name)),
                entries,
            ),
        ),
    );
}

function resolveSafePackageRelativePath(relativePath: string): string {
    const normalizedPath = relativePath.trim();
    const resolvedRelativePath = relative(".", normalizedPath);

    if (
        normalizedPath === ""
        || resolvedRelativePath === ".."
        || resolvedRelativePath.startsWith(`..${sep}`)
    ) {
        throw createInvalidPackageMetadataError(
            `Package files entry ${JSON.stringify(relativePath)} resolves outside the package root.`,
        );
    }

    return normalizedPath;
}

function isLocalOnlyPackagePath(relativePath: string): boolean {
    const pathName = basename(relativePath).toLowerCase();

    return localOnlyPackagePathNames.has(pathName)
        || pathName.startsWith(".env.")
        || pathName.endsWith(".local")
        || pathName.endsWith(".secret");
}

function createArchivePath(relativePath: string): string {
    return posix.join("package", relativePath.replaceAll(sep, posix.sep));
}

function ensureTarDirectoryPath(path: string): string {
    return path.endsWith(posix.sep) ? path : `${path}${posix.sep}`;
}

function createTarHeader(options: {
    path: string;
    size: number;
    type: "0" | "5";
}): Buffer {
    const header = Buffer.alloc(tarHeaderSize);

    writeTarPath(header, options.path);
    writeTarOctal(header, options.type === "5" ? 0o755 : 0o644, 100, 8);
    writeTarOctal(header, 0, 108, 8);
    writeTarOctal(header, 0, 116, 8);
    writeTarOctal(header, options.size, 124, 12);
    writeTarOctal(header, 0, 136, 12);
    header.fill(0x20, 148, 156);
    header.write(options.type, 156, 1, "ascii");
    header.write("ustar", 257, 5, "ascii");
    header[262] = 0;
    header.write("00", 263, 2, "ascii");

    const checksum = header.reduce((sum, value) => sum + value, 0);
    const checksumText = checksum.toString(8).padStart(6, "0");

    header.write(checksumText, 148, 6, "ascii");
    header[154] = 0;
    header[155] = 0x20;

    return header;
}

function writeTarPath(header: Buffer, path: string): void {
    const pathBuffer = Buffer.from(path);

    if (pathBuffer.length <= 100) {
        pathBuffer.copy(header, 0);
        return;
    }

    const pathSegments = path.split(posix.sep);

    for (let splitIndex = pathSegments.length - 1; splitIndex > 0; splitIndex -= 1) {
        const prefix = pathSegments.slice(0, splitIndex).join(posix.sep);
        const name = pathSegments.slice(splitIndex).join(posix.sep);
        const prefixBuffer = Buffer.from(prefix);
        const nameBuffer = Buffer.from(name);

        if (prefixBuffer.length <= 155 && nameBuffer.length <= 100) {
            nameBuffer.copy(header, 0);
            prefixBuffer.copy(header, 345);
            return;
        }
    }

    throw createInvalidPackageMetadataError(
        `Package archive path is too long: ${path}`,
    );
}

function writeTarOctal(
    header: Buffer,
    value: number,
    offset: number,
    length: number,
): void {
    const text = value.toString(8).padStart(length - 1, "0");

    header.write(text, offset, length - 1, "ascii");
    header[offset + length - 1] = 0;
}

function createTarPadding(size: number): Buffer {
    const remainder = size % tarBlockSize;

    return remainder === 0
        ? Buffer.alloc(0)
        : Buffer.alloc(tarBlockSize - remainder);
}

function createPublishMetadata(
    manifest: PublishManifest,
    tarballBytes: Uint8Array,
    registry: string,
    visibility: SkillPublishVisibility,
): unknown {
    const tarballName = `${manifest.name}-${manifest.version}.tgz`;
    const versionManifest = {
        ...manifest,
        _id: `${manifest.name}@${manifest.version}`,
        _nodeVersion: process.version,
        dist: {
            ...(manifest.dist ?? {}),
            integrity: createSha512Integrity(tarballBytes),
            shasum: createSha1Hex(tarballBytes),
            tarball: createDistTarballUrl(registry, manifest.name, manifest.version),
        },
    };

    return {
        "_id": manifest.name,
        "name": manifest.name,
        "description": typeof manifest.description === "string"
            ? manifest.description
            : "",
        "dist-tags": {
            latest: manifest.version,
        },
        "versions": {
            [manifest.version]: versionManifest,
        },
        "access": createPublishAccess(visibility),
        "_attachments": {
            [tarballName]: {
                content_type: "application/octet-stream",
                data: Buffer.from(tarballBytes).toString("base64"),
                length: tarballBytes.length,
            },
        },
    };
}

function createPublishAccess(
    visibility: SkillPublishVisibility,
): "public" | "restricted" {
    return visibility === "public" ? "public" : "restricted";
}

async function requestSkillPackagePublish(options: {
    apiKey: string;
    body: string;
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
    packageName: string;
    packageVersion: string;
    requestUrl: URL;
}): Promise<Response> {
    let response: Response;

    try {
        response = await options.context.fetcher(options.requestUrl, {
            body: options.body,
            headers: {
                "Authorization": options.apiKey,
                "Content-Type": "application/json",
                "npm-command": "publish",
                "User-Agent": npmCompatiblePublishUserAgent,
            },
            method: "PUT",
        });
    }
    catch (error) {
        throw new CliUserError("errors.skills.publish.requestError", 1, {
            message: getUnexpectedRequestErrorMessage(
                error,
                options.context.translator,
            ),
        });
    }

    if (response.ok) {
        return response;
    }

    const responseBody = await response.text();

    options.context.logger.warn(
        {
            packageName: options.packageName,
            packageVersion: options.packageVersion,
            status: response.status,
            target: options.requestUrl.href,
        },
        "Skill package publish request returned a non-success status.",
    );

    throw new CliUserError("errors.skills.publish.requestFailed", 1, {
        message: responseBody.trim() || response.statusText,
        status: response.status,
    });
}

function createPublishRequestUrl(registry: string, packageName: string): URL {
    return new URL(`${trimTrailingSlash(registry)}/${escapePackageName(packageName)}`);
}

function createDistTarballUrl(
    registry: string,
    packageName: string,
    packageVersion: string,
): string {
    const packagePath = encodeURI(packageName);
    const tarballPackageName = resolveRegistryPackageTarballPackageName(packageName);

    return `${trimTrailingSlash(registry)}/${packagePath}/-/meta/${encodeURIComponent(tarballPackageName)}-${encodeURIComponent(packageVersion)}.tgz`;
}

function createOoRegistryBaseUrl(endpoint: string): string {
    return `https://registry.${endpoint}`;
}

function escapePackageName(name: string): string {
    return name.startsWith("@")
        ? name.replace("/", "%2f")
        : encodeURIComponent(name);
}

function resolveRegistryPackageTarballPackageName(packageName: string): string {
    if (!packageName.startsWith("@")) {
        return packageName;
    }

    const scopeSeparatorIndex = packageName.indexOf("/");

    if (scopeSeparatorIndex < 0 || scopeSeparatorIndex === packageName.length - 1) {
        return packageName;
    }

    return packageName.slice(scopeSeparatorIndex + 1);
}

function trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

function createSha1Hex(bytes: Uint8Array): string {
    return createHash("sha1").update(bytes).digest("hex");
}

function createSha512Integrity(bytes: Uint8Array): string {
    const digest = createHash("sha512").update(bytes).digest("base64");

    return `sha512-${digest}`;
}

function createInvalidPackageMetadataError(message: string): CliUserError {
    return new CliUserError("errors.skills.publish.invalidPackageMetadata", 1, {
        message,
    });
}

async function removeManagedOoArtifactsFromSkillFile(
    skillFilePath: string,
): Promise<void> {
    const content = await readFile(skillFilePath, "utf8");
    const nextContent = removeManagedOoSkillArtifacts(content);

    if (nextContent === content) {
        return;
    }

    await Bun.write(skillFilePath, nextContent);
}

async function readSkillMarkdownMatter(
    skillFilePath: string,
): Promise<matter.GrayMatterFile<string> & { data: Record<string, unknown> }> {
    let content: string;

    try {
        content = await readFile(skillFilePath, "utf8");
    }
    catch (error) {
        if (isFileMissingError(error)) {
            throw createInvalidSkillFileError(
                skillFilePath,
                "SKILL.md does not exist.",
            );
        }

        throw error;
    }

    let parsed: matter.GrayMatterFile<string>;

    try {
        parsed = matter(content);
    }
    catch {
        throw createInvalidSkillFileError(
            skillFilePath,
            "Frontmatter must be a YAML dictionary.",
        );
    }

    if (!hasFrontmatter(content) || !isPlainRecord(parsed.data)) {
        throw createInvalidSkillFileError(
            skillFilePath,
            "Frontmatter must be a YAML dictionary.",
        );
    }

    return parsed as matter.GrayMatterFile<string> & {
        data: Record<string, unknown>;
    };
}

function validateResolvedPackageMetadata(
    options: ConvertSkillPackageOptions,
): void {
    if (!isNonBlankString(options.packageName)) {
        throw new CliUserError("errors.skills.publish.invalidPackageMetadata", 1, {
            message: "Package name must be a non-empty string.",
        });
    }

    if (!isSemver(options.version)) {
        throw new CliUserError("errors.skills.publish.invalidPackageMetadata", 1, {
            message: "Package version must be a valid semver string.",
        });
    }
}

function renderPackageJson(metadata: PackageMetadataFile): string {
    return `${JSON.stringify({
        name: metadata.name,
        version: metadata.version,
        displayName: metadata.displayName,
        description: metadata.description,
        ...(metadata.icon === undefined ? {} : { icon: metadata.icon }),
        files: skillPackageFiles,
    }, null, 2)}\n`;
}

function renderOoPackageYaml(metadata: PackageMetadataFile): string {
    const lines = [
        `name: ${JSON.stringify(metadata.name)}`,
        `version: ${metadata.version}`,
        `displayName: ${JSON.stringify(metadata.displayName)}`,
        `description: ${JSON.stringify(metadata.description)}`,
    ];

    if (metadata.icon !== undefined) {
        lines.push(`icon: ${JSON.stringify(metadata.icon)}`);
    }

    return `${lines.join("\n")}\n`;
}

function readRequiredFrontmatterString(
    value: unknown,
    fieldName: string,
    skillFilePath: string,
): string {
    if (!isNonBlankString(value)) {
        throw createInvalidSkillFileError(
            skillFilePath,
            `Frontmatter must include a non-empty string ${fieldName} field.`,
        );
    }

    return value;
}

function readOptionalFrontmatterString(
    value: unknown,
    fieldName: string,
    skillFilePath: string,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!isNonBlankString(value)) {
        throw createInvalidSkillFileError(
            skillFilePath,
            `Frontmatter ${fieldName} field must be a non-empty string if provided.`,
        );
    }

    return value;
}

function hasFrontmatter(content: string): boolean {
    return content.trimStart().startsWith("---");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object"
        && value !== null
        && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function createInvalidSkillFileError(
    path: string,
    message: string,
): CliUserError {
    return new CliUserError("errors.skills.publish.invalidSkillFile", 1, {
        message,
        path,
    });
}
