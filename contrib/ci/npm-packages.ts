import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

import platformTargetsData from "../npm/platform-targets.json";

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

const wrapperFiles = [
    "bin/oo.cjs",
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

export async function buildNpmReleasePackages(options: {
    outDir?: string;
    packageManifestPath?: string;
    rootDir?: string;
    releaseVersion?: string;
    targetIds?: readonly string[];
}): Promise<readonly string[]> {
    const rootDir = options.rootDir ?? process.cwd();
    const packageManifestPath = options.packageManifestPath ?? join(rootDir, "package.json");
    const outDir = options.outDir ?? join(rootDir, "dist");
    const packageManifestContent = await Bun.file(packageManifestPath).text();
    const releaseVersion = resolvePackageVersion(
        packageManifestContent,
        options.releaseVersion,
    );
    const selectedTargets = selectPlatformTargets(options.targetIds);
    const stagingDir = join(outDir, ".packages");
    const tarballPaths: string[] = [];

    rmSync(outDir, { force: true, recursive: true });
    mkdirSync(stagingDir, { recursive: true });

    for (const target of selectedTargets) {
        const packageDir = join(stagingDir, target.id);
        preparePackageDirectory(packageDir);
        writeFileSync(
            join(packageDir, "package.json"),
            buildPlatformPackageManifest(
                packageManifestContent,
                releaseVersion,
                target,
            ),
        );
        copyReadme(rootDir, packageDir);
        compilePlatformBinary(rootDir, packageDir, target);
        tarballPaths.push(packPackage(packageDir, outDir));
    }

    const wrapperDir = join(stagingDir, "wrapper");
    preparePackageDirectory(wrapperDir);
    writeFileSync(
        join(wrapperDir, "package.json"),
        buildWrapperPackageManifest(packageManifestContent, releaseVersion),
    );
    copyReadme(rootDir, wrapperDir);
    copyFile(
        join(rootDir, "contrib/npm/oo.cjs"),
        join(wrapperDir, "bin/oo.cjs"),
    );
    copyFile(
        join(rootDir, "contrib/npm/platform-runtime.cjs"),
        join(wrapperDir, "bin/platform-runtime.cjs"),
    );
    copyFile(
        join(rootDir, "contrib/npm/platform-targets.json"),
        join(wrapperDir, "bin/platform-targets.json"),
    );
    tarballPaths.push(packPackage(wrapperDir, outDir));

    writeFileSync(
        join(outDir, "npm-publish-order.txt"),
        `${tarballPaths.join("\n")}\n`,
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

function ensureReleaseVersion(releaseVersion: string): void {
    if (releaseVersion.trim() === "") {
        throw new Error("RELEASE_VERSION is required.");
    }
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

function copyReadme(rootDir: string, packageDir: string): void {
    copyFile(join(rootDir, "README.md"), join(packageDir, "README.md"));
}

function copyFile(sourcePath: string, destinationPath: string): void {
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
}

function compilePlatformBinary(
    rootDir: string,
    packageDir: string,
    target: PlatformTarget,
): void {
    const outputPath = join(packageDir, "bin", target.executableFileName);
    const buildResult = Bun.spawnSync(
        [
            "bun",
            "build",
            "--compile",
            `--target=${target.bunTarget}`,
            "./index.ts",
            "--outfile",
            outputPath,
        ],
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
