import { chmodSync, copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import platformTargetsData from "../npm/platform-targets.json";
import { createGitHubReleaseBundle } from "./release-bundle.ts";
import { ensureReleaseVersion } from "./release-version.ts";

interface PackageManifest {
    author?: string;
    description?: string;
    keywords?: string[];
    license?: string;
    name: string;
    repository?: Record<string, unknown>;
    version: string;
}

interface PlatformTarget {
    bunTarget: string;
    cpu: string;
    executableFileName: string;
    id: string;
    libc?: string;
    os: string;
    packageName: string;
}

interface RuntimeLike {
    arch: string;
    platform: string;
    report?: {
        getReport?: () => {
            header?: {
                glibcVersionRuntime?: string;
            };
        };
    };
}

interface CompileBuildMetadata {
    buildTimestamp: number;
    gitCommit: string;
    version: string;
}

export type BuildTargetPreset = "current-platform" | "linux" | "macos" | "windows";

const wrapperFiles = [
    "bin/oo.cjs",
    "bin/postinstall.cjs",
    "bin/platform-runtime.cjs",
    "bin/platform-targets.json",
    "README.md",
] as const;

const referenceManifestKeyOrder = [
    "name",
    "type",
    "version",
    "private",
    "description",
    "author",
    "license",
    "repository",
    "keywords",
    "module",
    "bin",
    "files",
    "scripts",
    "peerDependencies",
    "dependencies",
    "devDependencies",
] as const;

const explicitExtraOrder = [
    "main",
    "engines",
    "os",
    "cpu",
    "libc",
    "optionalDependencies",
    "publishConfig",
] as const;

const platformTargets = platformTargetsData as PlatformTarget[];
const compileAssetNamingPattern = "[name]-[hash].[ext]";
export const releasePackagesDirectoryName = "release-packages";
const wrapperPackageDirectoryName = "wrapper";
const buildTargetPresetPlatforms = {
    linux: "linux",
    macos: "darwin",
    windows: "win32",
} as const satisfies Record<Exclude<BuildTargetPreset, "current-platform">, NodeJS.Platform>;

export function getPlatformTargets(): readonly PlatformTarget[] {
    return [...platformTargets];
}

export function buildWrapperPackageManifest(
    packageManifestContent: string,
    releaseVersion: string,
): string {
    ensureReleaseVersion(releaseVersion);
    const baseManifest = parsePackageManifest(packageManifestContent);
    const optionalDependencies = Object.fromEntries(
        platformTargets.map(target => [target.packageName, releaseVersion]),
    );

    const wrapperManifest = {
        author: baseManifest.author,
        bin: {
            oo: "./bin/oo.cjs",
        },
        description: baseManifest.description,
        engines: {
            node: ">=18",
        },
        files: [...wrapperFiles],
        keywords: baseManifest.keywords,
        license: baseManifest.license,
        main: "./bin/platform-runtime.cjs",
        name: baseManifest.name,
        optionalDependencies,
        private: false,
        publishConfig: {
            access: "public",
        },
        repository: baseManifest.repository,
        scripts: {
            postinstall: "node ./bin/postinstall.cjs",
        },
        type: "commonjs",
        version: releaseVersion,
    };

    return serializeManifest(wrapperManifest);
}

export function buildPlatformPackageManifest(
    packageManifestContent: string,
    releaseVersion: string,
    target: PlatformTarget,
): string {
    ensureReleaseVersion(releaseVersion);
    const baseManifest = parsePackageManifest(packageManifestContent);
    const platformManifest = {
        author: baseManifest.author,
        cpu: [target.cpu],
        description: `${baseManifest.description ?? "oo CLI"} (${formatTargetLabel(target)} binary)`,
        files: [`bin/${target.executableFileName}`],
        keywords: baseManifest.keywords,
        license: baseManifest.license,
        name: target.packageName,
        os: [target.os],
        private: false,
        publishConfig: {
            access: "public",
        },
        repository: baseManifest.repository,
        version: releaseVersion,
        ...(target.libc
            ? {
                    libc: [target.libc],
                }
            : {}),
    };

    return serializeManifest(platformManifest);
}

export async function stagePlatformReleasePackages(options: {
    outDir?: string;
    packageManifestPath?: string;
    rootDir?: string;
    releaseVersion?: string;
    targetIds?: readonly string[];
}): Promise<void> {
    const releaseBuildOptions = await resolveReleaseBuildOptions(options);
    const selectedTargets = selectPlatformTargets(options.targetIds);
    const compileBuildMetadata = resolveCompileBuildMetadata(
        releaseBuildOptions.rootDir,
        releaseBuildOptions.releaseVersion,
    );

    rmSync(releaseBuildOptions.stagingDir, { force: true, recursive: true });
    mkdirSync(releaseBuildOptions.stagingDir, { recursive: true });

    for (const target of selectedTargets) {
        stagePlatformPackage({
            packageManifestContent: releaseBuildOptions.packageManifestContent,
            releaseVersion: releaseBuildOptions.releaseVersion,
            rootDir: releaseBuildOptions.rootDir,
            stagingDir: releaseBuildOptions.stagingDir,
            target,
            buildMetadata: compileBuildMetadata,
        });
    }
}

export async function assembleReleaseArtifacts(options: {
    outDir?: string;
    packageManifestPath?: string;
    rootDir?: string;
    releaseVersion?: string;
    targetIds?: readonly string[];
}): Promise<readonly string[]> {
    const releaseBuildOptions = await resolveReleaseBuildOptions(options);
    const selectedTargets = resolveAssemblyTargets(
        releaseBuildOptions.stagingDir,
        options.targetIds,
    );
    const tarballPaths: string[] = [];

    clearReleaseOutputDirectory(
        releaseBuildOptions.outDir,
        releaseBuildOptions.stagingDir,
    );

    for (const target of selectedTargets) {
        tarballPaths.push(
            packPackage(
                join(releaseBuildOptions.stagingDir, target.id),
                releaseBuildOptions.outDir,
            ),
        );
    }

    const wrapperDir = stageWrapperPackage({
        packageManifestContent: releaseBuildOptions.packageManifestContent,
        releaseVersion: releaseBuildOptions.releaseVersion,
        rootDir: releaseBuildOptions.rootDir,
        stagingDir: releaseBuildOptions.stagingDir,
    });
    tarballPaths.push(packPackage(wrapperDir, releaseBuildOptions.outDir));

    const releaseBundlePath = await createGitHubReleaseBundle({
        outDir: releaseBuildOptions.outDir,
        releaseVersion: releaseBuildOptions.releaseVersion,
        stagingDir: releaseBuildOptions.stagingDir,
        targets: selectedTargets.map(target => ({
            executableFileName: target.executableFileName,
            id: target.id,
        })),
    });

    writeFileSync(
        join(releaseBuildOptions.outDir, "npm-publish-order.txt"),
        `${tarballPaths.join("\n")}\n`,
    );
    writeFileSync(
        join(releaseBuildOptions.outDir, "github-release-assets.txt"),
        `${[...tarballPaths, releaseBundlePath].join("\n")}\n`,
    );

    return tarballPaths;
}

function parsePackageManifest(packageManifestContent: string): PackageManifest {
    return JSON.parse(packageManifestContent) as PackageManifest;
}

export function resolvePackageVersion(
    packageManifestContent: string,
    releaseVersionOverride: string | undefined,
): string {
    const baseManifest = parsePackageManifest(packageManifestContent);
    const resolvedVersion = releaseVersionOverride ?? baseManifest.version;

    ensureReleaseVersion(resolvedVersion);

    return resolvedVersion;
}

export function selectPlatformTargets(targetIds: readonly string[] | undefined): readonly PlatformTarget[] {
    if (!targetIds || targetIds.length === 0) {
        return platformTargets;
    }

    const selectedTargets: PlatformTarget[] = [];

    for (const targetId of targetIds) {
        const matchedTarget = platformTargets.find(target => target.id === targetId);

        if (!matchedTarget) {
            throw new Error(`Unsupported build target: ${targetId}`);
        }

        selectedTargets.push(matchedTarget);
    }

    return selectedTargets;
}

export function resolveCurrentPlatformTarget(
    runtime: RuntimeLike = process,
): PlatformTarget {
    const libc = runtime.platform === "linux" ? detectLinuxLibc(runtime) : undefined;
    const matchedTarget = platformTargets.find(target =>
        target.os === runtime.platform
        && target.cpu === runtime.arch
        && (target.libc ?? null) === (libc ?? null),
    );

    if (!matchedTarget) {
        throw new Error(
            `No build target is configured for ${formatRuntimeTarget(runtime, libc)}.`,
        );
    }

    return matchedTarget;
}

export function parseBuildTargetIds(rawTargetIds: string): readonly string[] | undefined {
    if (rawTargetIds === "") {
        return undefined;
    }

    return rawTargetIds
        .split(",")
        .map(targetId => targetId.trim())
        .filter(targetId => targetId !== "");
}

export function resolveBuildTargetIdsForPreset(
    preset: BuildTargetPreset,
    runtime: RuntimeLike = process,
): readonly string[] {
    if (preset === "current-platform") {
        return [resolveCurrentPlatformTarget(runtime).id];
    }

    const platform = buildTargetPresetPlatforms[preset];

    return platformTargets
        .filter(target => target.os === platform)
        .map(target => target.id);
}

function serializeManifest(packageManifest: Record<string, unknown>): string {
    const orderedManifest = orderManifestFields(packageManifest);

    return `${JSON.stringify(orderedManifest, null, 2)}\n`;
}

function orderManifestFields(packageManifest: Record<string, unknown>): Record<string, unknown> {
    const orderedManifest: Record<string, unknown> = {};

    for (const key of referenceManifestKeyOrder) {
        if (key in packageManifest) {
            orderedManifest[key] = packageManifest[key];
        }
    }

    for (const key of explicitExtraOrder) {
        if (key in packageManifest && !(key in orderedManifest)) {
            orderedManifest[key] = packageManifest[key];
        }
    }

    for (const [key, value] of Object.entries(packageManifest)) {
        if (!(key in orderedManifest)) {
            orderedManifest[key] = value;
        }
    }

    return orderedManifest;
}

function preparePackageDirectory(packageDir: string): void {
    rmSync(packageDir, { force: true, recursive: true });
    mkdirSync(packageDir, { recursive: true });
}

function stagePlatformPackage(options: {
    packageManifestContent: string;
    releaseVersion: string;
    rootDir: string;
    stagingDir: string;
    target: PlatformTarget;
    buildMetadata: CompileBuildMetadata;
}): void {
    const packageDir = join(options.stagingDir, options.target.id);

    preparePackageDirectory(packageDir);
    writeFileSync(
        join(packageDir, "package.json"),
        buildPlatformPackageManifest(
            options.packageManifestContent,
            options.releaseVersion,
            options.target,
        ),
    );
    copyReadme(options.rootDir, packageDir);
    compilePlatformBinary(
        options.rootDir,
        packageDir,
        options.target,
        options.buildMetadata,
    );
}

function stageWrapperPackage(options: {
    packageManifestContent: string;
    releaseVersion: string;
    rootDir: string;
    stagingDir: string;
}): string {
    const wrapperDir = join(options.stagingDir, wrapperPackageDirectoryName);

    preparePackageDirectory(wrapperDir);
    writeFileSync(
        join(wrapperDir, "package.json"),
        buildWrapperPackageManifest(
            options.packageManifestContent,
            options.releaseVersion,
        ),
    );
    copyReadme(options.rootDir, wrapperDir);
    copyFile(
        join(options.rootDir, "contrib/npm/oo.cjs"),
        join(wrapperDir, "bin/oo.cjs"),
    );
    copyFile(
        join(options.rootDir, "contrib/npm/postinstall.cjs"),
        join(wrapperDir, "bin/postinstall.cjs"),
    );
    copyFile(
        join(options.rootDir, "contrib/npm/platform-runtime.cjs"),
        join(wrapperDir, "bin/platform-runtime.cjs"),
    );
    copyFile(
        join(options.rootDir, "contrib/npm/platform-targets.json"),
        join(wrapperDir, "bin/platform-targets.json"),
    );

    return wrapperDir;
}

function copyReadme(rootDir: string, packageDir: string): void {
    copyFile(join(rootDir, "README.md"), join(packageDir, "README.md"));
}

function copyFile(sourcePath: string, destinationPath: string): void {
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
}

function clearReleaseOutputDirectory(outDir: string, stagingDir: string): void {
    mkdirSync(outDir, { recursive: true });
    const resolvedStagingDir = resolve(stagingDir);

    for (const entry of readdirSync(outDir, { withFileTypes: true })) {
        const entryPath = join(outDir, entry.name);

        if (resolve(entryPath) === resolvedStagingDir) {
            continue;
        }

        rmSync(entryPath, { force: true, recursive: true });
    }
}

function compilePlatformBinary(
    rootDir: string,
    packageDir: string,
    target: PlatformTarget,
    buildMetadata: CompileBuildMetadata,
): void {
    const outputPath = join(packageDir, "bin", target.executableFileName);
    const buildResult = Bun.spawnSync(
        buildCompileCommandArgs(target, buildMetadata, outputPath),
        {
            cwd: rootDir,
            stderr: "pipe",
            stdin: "ignore",
            stdout: "pipe",
        },
    );

    if (buildResult.exitCode !== 0) {
        throw new Error(
            [
                `Failed to compile ${target.packageName}.`,
                decodeOutput(buildResult.stderr),
            ].join("\n"),
        );
    }

    if (target.os !== "win32") {
        chmodSync(outputPath, 0o755);
    }
}

export function buildCompileCommandArgs(
    target: PlatformTarget,
    buildMetadata: CompileBuildMetadata,
    outputPath: string,
): string[] {
    // Keep embedded asset filenames unique across bundled skills.
    return [
        "bun",
        "build",
        "--compile",
        "--bytecode",
        "--format",
        "esm",
        "--minify",
        "--no-compile-autoload-dotenv",
        "--no-compile-autoload-bunfig",
        `--asset-naming=${compileAssetNamingPattern}`,
        `--target=${target.bunTarget}`,
        ...buildCompileDefineArgs(buildMetadata),
        "./index.ts",
        "--outfile",
        outputPath,
    ];
}

export function buildCompileDefineArgs(
    buildMetadata: CompileBuildMetadata,
): readonly string[] {
    return [
        "--define",
        `BUILD_VERSION=${JSON.stringify(buildMetadata.version)}`,
        "--define",
        `BUILD_TIMESTAMP=${buildMetadata.buildTimestamp}`,
        "--define",
        `GIT_COMMIT=${JSON.stringify(buildMetadata.gitCommit)}`,
    ];
}

function packPackage(packageDir: string, outDir: string): string {
    const packResult = Bun.spawnSync(
        ["bun", "pm", "pack", "--destination", outDir, "--quiet"],
        {
            cwd: packageDir,
            stderr: "pipe",
            stdin: "ignore",
            stdout: "pipe",
        },
    );

    if (packResult.exitCode !== 0) {
        throw new Error(
            [
                `Failed to pack ${packageDir}.`,
                decodeOutput(packResult.stderr),
            ].join("\n"),
        );
    }

    return decodeOutput(packResult.stdout).trim();
}

function decodeOutput(output: Uint8Array): string {
    return new TextDecoder().decode(output);
}

function resolveCompileBuildMetadata(
    rootDir: string,
    version: string,
): CompileBuildMetadata {
    return {
        buildTimestamp: Date.now(),
        gitCommit: readGitCommitHash(rootDir),
        version,
    };
}

function readGitCommitHash(rootDir: string): string {
    const gitResult = Bun.spawnSync(
        ["git", "rev-parse", "HEAD"],
        {
            cwd: rootDir,
            stderr: "pipe",
            stdin: "ignore",
            stdout: "pipe",
        },
    );

    if (gitResult.exitCode !== 0) {
        return "unknown";
    }

    const gitCommitHash = decodeOutput(gitResult.stdout).trim();

    return gitCommitHash === "" ? "unknown" : gitCommitHash;
}

function formatTargetLabel(target: PlatformTarget): string {
    return [target.os, target.cpu, target.libc].filter(Boolean).join(" ");
}

function detectLinuxLibc(runtime: RuntimeLike): string | undefined {
    if (runtime.platform !== "linux") {
        return undefined;
    }

    const report = typeof runtime.report?.getReport === "function"
        ? runtime.report.getReport()
        : undefined;
    const header = report && typeof report === "object" ? report.header : undefined;

    if (
        header
        && typeof header.glibcVersionRuntime === "string"
        && header.glibcVersionRuntime !== ""
    ) {
        return "glibc";
    }

    return "musl";
}

function formatRuntimeTarget(
    runtime: RuntimeLike,
    libc: string | undefined,
): string {
    return [runtime.platform, runtime.arch, libc].filter(Boolean).join(" ");
}

async function resolveReleaseBuildOptions(options: {
    outDir?: string;
    packageManifestPath?: string;
    rootDir?: string;
    releaseVersion?: string;
}): Promise<{
    outDir: string;
    packageManifestContent: string;
    releaseVersion: string;
    rootDir: string;
    stagingDir: string;
}> {
    const rootDir = options.rootDir ?? process.cwd();
    const packageManifestPath = options.packageManifestPath ?? join(rootDir, "package.json");
    const outDir = options.outDir ?? join(rootDir, "dist");
    const packageManifestContent = await Bun.file(packageManifestPath).text();
    const releaseVersion = resolvePackageVersion(
        packageManifestContent,
        options.releaseVersion,
    );

    return {
        outDir,
        packageManifestContent,
        releaseVersion,
        rootDir,
        stagingDir: join(outDir, releasePackagesDirectoryName),
    };
}

function resolveAssemblyTargets(
    stagingDir: string,
    targetIds: readonly string[] | undefined,
): readonly PlatformTarget[] {
    const stagedTargetIds = discoverStagedTargetIds(stagingDir);

    if (!targetIds || targetIds.length === 0) {
        return selectPlatformTargets(stagedTargetIds);
    }

    const stagedTargetIdSet = new Set(stagedTargetIds);
    const selectedTargets = selectPlatformTargets(targetIds);

    for (const target of selectedTargets) {
        if (!stagedTargetIdSet.has(target.id)) {
            throw new Error(`Missing staged package for target: ${target.id}`);
        }
    }

    return selectedTargets;
}

function discoverStagedTargetIds(stagingDir: string): readonly string[] {
    const stagedTargetNameSet = new Set(
        readdirSync(stagingDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(entryName => entryName !== wrapperPackageDirectoryName),
    );

    if (stagedTargetNameSet.size === 0) {
        throw new Error("No staged platform packages were found.");
    }

    const knownTargetIdSet = new Set(platformTargets.map(target => target.id));

    for (const entryName of stagedTargetNameSet) {
        if (!knownTargetIdSet.has(entryName)) {
            throw new Error(`Unsupported staged package target: ${entryName}`);
        }
    }

    return platformTargets
        .filter(target => stagedTargetNameSet.has(target.id))
        .map(target => target.id);
}
