import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export interface NpmPackageMetadata {
    name: string;
    version: string;
}

export interface NpmCommandResult {
    exitCode: number;
    stderr: string;
    stdout: string;
}

interface PublishNpmPackagesOptions {
    logger?: Pick<Console, "log">;
    packageVersionExists?: (metadata: NpmPackageMetadata) => Promise<boolean>;
    publishOrderPath: string;
    publishPackage?: (packageFile: string) => Promise<NpmCommandResult>;
    readPackageMetadata?: (packageFile: string) => Promise<NpmPackageMetadata>;
    retryCount?: number;
    retryDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void> | void;
}

const defaultPublishRetryCount = 5;
const defaultPublishRetryDelayMs = 15_000;
const existingVersionErrorFragments = [
    "cannot publish over",
    "previously published versions",
] as const;
const missingPackageVersionErrorFragments = [
    "E404",
    "No match found for version",
] as const;
const transientPublishErrorFragments = [
    "TLOG_CREATE_ENTRY_ERROR",
    "aborted",
    "ECONNRESET",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "socket hang up",
    "too many requests",
    "429",
    "500",
    "502",
    "503",
    "504",
    "rekor.sigstore.dev",
] as const;

export async function publishNpmPackagesFromOrderFile(
    options: PublishNpmPackagesOptions,
): Promise<void> {
    const packageFiles = parseNpmPublishOrderFile(
        await readFile(options.publishOrderPath, "utf8"),
    );
    const readPackageMetadata = options.readPackageMetadata ?? readNpmPackageMetadata;
    const publishPackage = options.publishPackage ?? publishNpmPackage;
    const packageVersionExists = options.packageVersionExists ?? npmPackageVersionExists;
    const sleep = options.sleep ?? Bun.sleep;
    const logger = options.logger ?? console;
    const retryCount = options.retryCount ?? defaultPublishRetryCount;
    const retryDelayMs = options.retryDelayMs ?? defaultPublishRetryDelayMs;

    for (const packageFile of packageFiles) {
        const metadata = await readPackageMetadata(packageFile);

        await publishNpmPackageWithRetry({
            logger,
            metadata,
            packageFile,
            packageVersionExists,
            publishPackage,
            retryCount,
            retryDelayMs,
            sleep,
        });
    }
}

export function parseNpmPublishOrderFile(content: string): readonly string[] {
    return content
        .split("\n")
        .map(line => line.endsWith("\r") ? line.slice(0, -1) : line)
        .filter(line => line !== "");
}

export async function readNpmPackageMetadata(packageFile: string): Promise<NpmPackageMetadata> {
    const extractDirectoryPath = await mkdtemp(join(tmpdir(), "oo-npm-package-"));

    try {
        const archive = new Bun.Archive(await Bun.file(packageFile).bytes());
        await archive.extract(extractDirectoryPath);

        const packageManifest = JSON.parse(
            await readFile(join(extractDirectoryPath, "package", "package.json"), "utf8"),
        ) as Partial<NpmPackageMetadata>;

        if (
            typeof packageManifest.name !== "string"
            || packageManifest.name === ""
            || typeof packageManifest.version !== "string"
            || packageManifest.version === ""
        ) {
            throw new Error(`Package metadata is missing name or version: ${packageFile}`);
        }

        return {
            name: packageManifest.name,
            version: packageManifest.version,
        };
    }
    finally {
        await rm(extractDirectoryPath, { force: true, recursive: true });
    }
}

async function publishNpmPackageWithRetry(options: {
    logger: Pick<Console, "log">;
    metadata: NpmPackageMetadata;
    packageFile: string;
    packageVersionExists: (metadata: NpmPackageMetadata) => Promise<boolean>;
    publishPackage: (packageFile: string) => Promise<NpmCommandResult>;
    retryCount: number;
    retryDelayMs: number;
    sleep: (delayMs: number) => Promise<void> | void;
}): Promise<void> {
    const packageSpec = formatPackageSpec(options.metadata);

    if (await options.packageVersionExists(options.metadata)) {
        options.logger.log(`Skipping ${packageSpec}: version already exists on npm.`);
        return;
    }

    for (let attempt = 1; attempt <= options.retryCount; attempt += 1) {
        const publishResult = await options.publishPackage(options.packageFile);
        if (publishResult.exitCode === 0) {
            options.logger.log(`Published ${packageSpec}.`);
            return;
        }

        const output = formatCommandOutput(publishResult);
        if (isExistingPackageVersionError(output)) {
            options.logger.log(`Skipping ${packageSpec}: npm reported the version already exists.`);
            return;
        }

        if (await options.packageVersionExists(options.metadata)) {
            options.logger.log(
                `Treating ${packageSpec} as published after npm returned a failure because the version now exists.`,
            );
            return;
        }

        if (
            !isTransientNpmPublishFailure(output)
            || attempt === options.retryCount
        ) {
            throw new Error(
                [
                    `Failed to publish ${packageSpec} from ${options.packageFile}.`,
                    output,
                ].join("\n"),
            );
        }

        const delayMs = options.retryDelayMs * attempt;
        options.logger.log(
            `Retrying ${packageSpec} after transient npm publish failure in ${delayMs}ms.`,
        );
        await options.sleep(delayMs);
    }
}

async function npmPackageVersionExists(metadata: NpmPackageMetadata): Promise<boolean> {
    const viewResult = await runNpmCommand([
        "npm",
        "view",
        formatPackageSpec(metadata),
        "version",
        "--json",
    ], { echoOutput: false });

    if (viewResult.exitCode === 0) {
        return true;
    }

    const output = formatCommandOutput(viewResult);
    if (isMissingPackageVersionError(output)) {
        return false;
    }

    throw new Error(
        [
            `Failed to query npm for ${formatPackageSpec(metadata)}.`,
            output,
        ].join("\n"),
    );
}

async function publishNpmPackage(packageFile: string): Promise<NpmCommandResult> {
    return await runNpmCommand([
        "npm",
        "publish",
        "--access",
        "public",
        packageFile,
    ], { echoOutput: true });
}

async function runNpmCommand(
    command: readonly string[],
    options: { echoOutput: boolean },
): Promise<NpmCommandResult> {
    const subprocess = Bun.spawn([...command], {
        stderr: "pipe",
        stdin: "ignore",
        stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
    ]);

    if (options.echoOutput) {
        process.stdout.write(stdout);
        process.stderr.write(stderr);
    }

    return {
        exitCode,
        stderr,
        stdout,
    };
}

function formatPackageSpec(metadata: NpmPackageMetadata): string {
    return `${metadata.name}@${metadata.version}`;
}

function formatCommandOutput(result: NpmCommandResult): string {
    return [result.stdout, result.stderr]
        .filter(output => output !== "")
        .join("\n");
}

function isExistingPackageVersionError(output: string): boolean {
    const normalizedOutput = output.toLowerCase();

    return existingVersionErrorFragments.every(fragment =>
        normalizedOutput.includes(fragment),
    );
}

function isMissingPackageVersionError(output: string): boolean {
    const normalizedOutput = output.toLowerCase();

    return missingPackageVersionErrorFragments.some(fragment =>
        normalizedOutput.includes(fragment.toLowerCase()),
    );
}

function isTransientNpmPublishFailure(output: string): boolean {
    const normalizedOutput = output.toLowerCase();

    return transientPublishErrorFragments.some(fragment =>
        normalizedOutput.includes(fragment.toLowerCase()),
    );
}
