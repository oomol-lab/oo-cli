import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

import { writeGitHubOutputText } from "./github-actions.ts";
import { releaseBundleLatestFileName } from "./release-bundle.ts";
import { normalizeExpectedVersion } from "./release-version.ts";

interface NormalizedReleaseVersion {
    releaseTag: string;
    releaseVersion: string;
}

interface ReleaseDownloadCommandInput {
    archiveDirectory: string;
    archiveName: string;
    releaseTag: string;
    sourceRepository: string;
}

export interface PrepareReleaseBundleUploadOptions {
    archivePath: string;
    extractDir: string;
    ossBucket: string;
    ossPrefix: string;
    uploadDir: string;
    version: string;
}

export interface PrepareReleaseBundleUploadResult extends NormalizedReleaseVersion {
    ossUri: string;
    uploadRoot: string;
}

export function normalizeReleaseVersion(inputVersion: string): NormalizedReleaseVersion {
    const releaseVersion = normalizeExpectedVersion(inputVersion);

    return {
        releaseTag: `v${releaseVersion}`,
        releaseVersion,
    };
}

export function buildReleaseDownloadCommand(input: ReleaseDownloadCommandInput): string[] {
    return [
        "gh",
        "release",
        "download",
        input.releaseTag,
        "--repo",
        input.sourceRepository,
        "--pattern",
        input.archiveName,
        "--dir",
        input.archiveDirectory,
        "--clobber",
    ];
}

export function buildOssUri(bucket: string, prefix: string): string {
    const prefixSegments = splitOssPathSegments(prefix);

    return `oss:${[bucket, ...prefixSegments].join("/")}`;
}

export function formatGitHubOutput(result: PrepareReleaseBundleUploadResult): string {
    return [
        `oss_uri=${result.ossUri}`,
        `release_tag=${result.releaseTag}`,
        `release_version=${result.releaseVersion}`,
        `upload_root=${result.uploadRoot}`,
        "",
    ].join("\n");
}

export async function prepareReleaseBundleUpload(
    options: PrepareReleaseBundleUploadOptions,
): Promise<PrepareReleaseBundleUploadResult> {
    const normalizedVersion = normalizeReleaseVersion(options.version);

    await Promise.all([
        rm(options.extractDir, { force: true, recursive: true }),
        rm(options.uploadDir, { force: true, recursive: true }),
    ]);
    await Promise.all([
        mkdir(options.extractDir, { recursive: true }),
        mkdir(options.uploadDir, { recursive: true }),
    ]);

    const archive = new Bun.Archive(await Bun.file(options.archivePath).bytes());
    await archive.extract(options.extractDir);

    const latestFilePath = join(options.extractDir, releaseBundleLatestFileName);
    const latestVersion = await readReleaseBundleLatestVersion(latestFilePath);

    if (latestVersion !== normalizedVersion.releaseVersion) {
        throw new Error(
            `release latest version ${latestVersion} does not match ${
                normalizedVersion.releaseVersion}`,
        );
    }

    const versionRoot = join(options.extractDir, normalizedVersion.releaseVersion);
    const uploadVersionRoot = join(options.uploadDir, normalizedVersion.releaseVersion);
    await Promise.all([
        rename(versionRoot, uploadVersionRoot),
        rename(latestFilePath, join(options.uploadDir, releaseBundleLatestFileName)),
    ]);

    return {
        ossUri: buildOssUri(options.ossBucket, options.ossPrefix),
        releaseTag: normalizedVersion.releaseTag,
        releaseVersion: normalizedVersion.releaseVersion,
        uploadRoot: options.uploadDir,
    };
}

async function downloadReleaseArchive(input: ReleaseDownloadCommandInput): Promise<void> {
    const processResult = Bun.spawn(buildReleaseDownloadCommand(input), {
        stderr: "inherit",
        stdout: "inherit",
        stdin: "ignore",
    });

    const exitCode = await processResult.exited;
    if (exitCode !== 0) {
        throw new Error(`Failed to download GitHub release archive for ${input.releaseTag}.`);
    }
}

async function readReleaseBundleLatestVersion(latestFilePath: string): Promise<string> {
    const latestMetadata = await Bun.file(latestFilePath).json() as { version?: unknown };
    if (typeof latestMetadata.version !== "string" || latestMetadata.version === "") {
        throw new Error("release latest version is missing");
    }

    return latestMetadata.version;
}

function splitOssPathSegments(value: string): string[] {
    return value
        .split("/")
        .map(segment => segment.trim())
        .filter(segment => segment !== "");
}

function parseOptions(args: readonly string[]): Map<string, string> {
    if (args.length % 2 !== 0) {
        throw new Error("Options must be provided as --name value pairs.");
    }

    const options = new Map<string, string>();

    for (let index = 0; index < args.length; index += 2) {
        const name = args[index];
        const value = args[index + 1];

        if (name === undefined || !name.startsWith("--")) {
            throw new Error(`Invalid option: ${name ?? ""}`);
        }

        if (value === undefined) {
            throw new Error(`Missing value for option: ${name}`);
        }

        options.set(name.slice(2), value);
    }

    return options;
}

function readRequiredOption(options: Map<string, string>, name: string): string {
    const value = options.get(name);
    if (value === undefined || value === "") {
        throw new Error(`${name} is required.`);
    }

    return value;
}

async function runPrepareUpload(commandArgs: readonly string[]): Promise<void> {
    const options = parseOptions(commandArgs);
    const version = readRequiredOption(options, "version");
    const archivePath = readRequiredOption(options, "archive-path");
    const archiveDirectory = dirname(archivePath);
    const archiveName = readRequiredOption(options, "archive-name");
    const extractDir = readRequiredOption(options, "extract-dir");
    const sourceRepository = readRequiredOption(options, "source-repository");
    const uploadDir = readRequiredOption(options, "upload-dir");
    const ossBucket = readRequiredOption(options, "oss-bucket");
    const ossPrefix = readRequiredOption(options, "oss-prefix");
    const { releaseTag } = normalizeReleaseVersion(version);

    await mkdir(archiveDirectory, { recursive: true });
    await downloadReleaseArchive({
        archiveDirectory,
        archiveName,
        releaseTag,
        sourceRepository,
    });

    const result = await prepareReleaseBundleUpload({
        archivePath,
        extractDir,
        ossBucket,
        ossPrefix,
        uploadDir,
        version,
    });
    await writeGitHubOutputText(formatGitHubOutput(result));
}

export async function main(args: readonly string[]): Promise<void> {
    const [command, ...commandArgs] = args;

    if (command !== "prepare-upload") {
        throw new Error(`Unsupported command: ${command ?? ""}`);
    }

    await runPrepareUpload(commandArgs);
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
