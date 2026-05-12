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
    commandEnv?: Record<string, string | undefined>;
    logger?: Pick<Console, "log">;
    npmCommandTimeoutMs?: number;
    packageVersionExists?: (metadata: NpmPackageMetadata) => Promise<boolean>;
    publishConcurrency?: number;
    publishOrderPath: string;
    publishPackage?: (packageFile: string) => Promise<NpmCommandResult>;
    readPackageMetadata?: (packageFile: string) => Promise<NpmPackageMetadata>;
    retryCount?: number;
    retryDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void> | void;
}

const defaultPublishRetryCount = 5;
const defaultPublishRetryDelayMs = 15_000;
const defaultPublishConcurrency = 8;
const defaultNpmCommandTimeoutMs = 120_000;
const npmCommandTimeoutExitCode = 124;
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
    const npmCommandTimeoutMs = resolveNpmCommandTimeoutMs(options.npmCommandTimeoutMs);
    const commandEnv = options.commandEnv;
    const readPackageMetadata = options.readPackageMetadata ?? readNpmPackageMetadata;
    const publishPackage = options.publishPackage
        ?? (packageFile => publishNpmPackage(packageFile, npmCommandTimeoutMs, commandEnv));
    const packageVersionExists = options.packageVersionExists
        ?? (metadata => npmPackageVersionExists(metadata, npmCommandTimeoutMs, commandEnv));
    const sleep = options.sleep ?? Bun.sleep;
    const logger = options.logger ?? console;
    const retryCount = resolvePublishRetryCount(options.retryCount);
    const retryDelayMs = resolvePublishRetryDelayMs(options.retryDelayMs);
    const publishConcurrency = resolvePublishConcurrency(options.publishConcurrency);

    const publishPackageFile = async (packageFile: string): Promise<void> => {
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
    };

    const finalPackageFile = packageFiles.at(-1);
    if (finalPackageFile === undefined) {
        return;
    }

    // The publish order file lists the wrapper package last (see npm-packages.ts).
    // The wrapper depends on the platform packages being installable from npm, so
    // it must be published only after every earlier package has succeeded.
    await publishNpmPackageFilesWithConcurrency(
        packageFiles.slice(0, -1),
        publishConcurrency,
        publishPackageFile,
    );
    await publishPackageFile(finalPackageFile);
}

export function parseNpmPublishOrderFile(content: string): readonly string[] {
    return content
        .split("\n")
        .map(line => line.trim())
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

async function publishNpmPackageFilesWithConcurrency(
    packageFiles: readonly string[],
    publishConcurrency: number,
    publishPackageFile: (packageFile: string) => Promise<void>,
): Promise<void> {
    let nextPackageIndex = 0;
    let firstError: unknown;
    const workerCount = Math.min(publishConcurrency, packageFiles.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (firstError === undefined) {
            const packageIndex = nextPackageIndex;
            nextPackageIndex += 1;
            const packageFile = packageFiles[packageIndex];

            if (packageFile === undefined) {
                return;
            }

            try {
                await publishPackageFile(packageFile);
            }
            catch (error) {
                firstError ??= error;
            }
        }
    }));

    if (firstError !== undefined) {
        throw firstError;
    }
}

async function npmPackageVersionExists(
    metadata: NpmPackageMetadata,
    timeoutMs: number,
    commandEnv: Record<string, string | undefined> | undefined,
): Promise<boolean> {
    const viewResult = await runNpmCommand([
        "npm",
        "view",
        formatPackageSpec(metadata),
        "version",
        "--json",
    ], { echoOutput: false, timeoutMs, commandEnv });

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

async function publishNpmPackage(
    packageFile: string,
    timeoutMs: number,
    commandEnv: Record<string, string | undefined> | undefined,
): Promise<NpmCommandResult> {
    return await runNpmCommand([
        "npm",
        "publish",
        "--access",
        "public",
        packageFile,
    ], { echoOutput: true, timeoutMs, commandEnv });
}

async function runNpmCommand(
    command: readonly string[],
    options: {
        commandEnv: Record<string, string | undefined> | undefined;
        echoOutput: boolean;
        timeoutMs: number;
    },
): Promise<NpmCommandResult> {
    const env = options.commandEnv === undefined
        ? undefined
        : {
                ...process.env,
                ...options.commandEnv,
            };
    const subprocess = Bun.spawn([...command], {
        env,
        killSignal: "SIGKILL",
        stderr: "pipe",
        stdin: "ignore",
        stdout: "pipe",
        timeout: options.timeoutMs,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
    ]);

    const timedOut = subprocess.signalCode === "SIGKILL";
    const result = {
        exitCode: timedOut ? npmCommandTimeoutExitCode : exitCode,
        stderr: timedOut
            ? appendNpmCommandTimeoutError(stderr, options.timeoutMs)
            : stderr,
        stdout,
    } satisfies NpmCommandResult;

    if (options.echoOutput) {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
    }

    return result;
}

function formatPackageSpec(metadata: NpmPackageMetadata): string {
    return `${metadata.name}@${metadata.version}`;
}

function formatCommandOutput(result: NpmCommandResult): string {
    return [result.stdout, result.stderr]
        .filter(output => output !== "")
        .join("\n");
}

function resolvePublishRetryCount(retryCount: number | undefined): number {
    const resolvedRetryCount = retryCount ?? defaultPublishRetryCount;
    if (!Number.isInteger(resolvedRetryCount) || resolvedRetryCount < 1) {
        throw new Error(`retryCount must be a positive integer, got: ${resolvedRetryCount}.`);
    }

    return resolvedRetryCount;
}

function resolvePublishRetryDelayMs(retryDelayMs: number | undefined): number {
    const resolvedRetryDelayMs = retryDelayMs ?? defaultPublishRetryDelayMs;
    if (!Number.isFinite(resolvedRetryDelayMs) || resolvedRetryDelayMs < 0) {
        throw new Error(`retryDelayMs must be a non-negative finite number, got: ${resolvedRetryDelayMs}.`);
    }

    return resolvedRetryDelayMs;
}

function resolvePublishConcurrency(publishConcurrency: number | undefined): number {
    const resolvedPublishConcurrency = publishConcurrency ?? defaultPublishConcurrency;
    if (!Number.isInteger(resolvedPublishConcurrency) || resolvedPublishConcurrency < 1) {
        throw new Error(`publishConcurrency must be a positive integer, got: ${resolvedPublishConcurrency}.`);
    }

    return resolvedPublishConcurrency;
}

function resolveNpmCommandTimeoutMs(timeoutMs: number | undefined): number {
    const resolvedTimeoutMs = timeoutMs ?? defaultNpmCommandTimeoutMs;
    if (!Number.isFinite(resolvedTimeoutMs) || resolvedTimeoutMs < 1) {
        throw new Error(`npm command timeout must be a positive number, got: ${resolvedTimeoutMs}.`);
    }

    return resolvedTimeoutMs;
}

function appendNpmCommandTimeoutError(stderr: string, timeoutMs: number): string {
    const timeoutError = `npm command timed out after ${timeoutMs}ms.`;
    if (stderr === "") {
        return timeoutError;
    }

    return `${stderr}\n${timeoutError}`;
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
