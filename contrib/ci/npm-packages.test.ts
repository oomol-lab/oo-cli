import type { CompileSpawnResult } from "./npm-packages.ts";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory } from "../../__tests__/helpers.ts";
import { getBundledSkillFiles } from "../../src/application/commands/skills/embedded-assets.ts";
import { writeReleaseBundleBinaryFixture } from "./__tests__/helpers.ts";
import {
    assembleReleaseArtifacts,
    buildCompileCommandArgs,
    buildCompileDefineArgs,
    buildPlatformPackageManifest,
    buildWrapperPackageManifest,
    compileExecutableWithTransientRetry,

    decodeOutput,
    getPlatformTargets,
    parseBuildTargetIds,
    releasePackagesDirectoryName,
    resolveBuildTargetIdsForPreset,
    resolveCurrentPlatformTarget,
    resolvePackageVersion,
    selectPlatformTargets,
} from "./npm-packages.ts";
import {
    buildReleaseBundleLatestMetadata,
    releaseBundleFileName,
    releaseBundleLatestFileName,
    resolveReleaseBundleTargetDirectory,
} from "./release-bundle.ts";

const baseManifest = JSON.stringify({
    name: "@oomol-lab/oo-cli",
    type: "module",
    version: "0.0.0-development",
    private: true,
    description: "OOMOL CLI",
    author: "OOMOL",
    license: "MIT",
    repository: {
        type: "git",
        url: "git+https://github.com/oomol-lab/oo-cli.git",
    },
    keywords: ["oomol", "cli"],
    module: "index.ts",
    bin: {
        oo: "./index.ts",
    },
    files: ["index.ts"],
    scripts: {
        dev: "bun run index.ts",
    },
    peerDependencies: {
        typescript: "^5",
    },
    dependencies: {
        zod: "^4.3.6",
    },
    devDependencies: {
        "@types/bun": "latest",
    },
});

const reorderedBaseManifest = JSON.stringify({
    repository: {
        type: "git",
        url: "git+https://github.com/oomol-lab/oo-cli.git",
    },
    version: "0.0.0-development",
    name: "@oomol-lab/oo-cli",
    devDependencies: {
        "@types/bun": "latest",
    },
    keywords: ["oomol", "cli"],
    files: ["index.ts"],
    private: true,
    author: "OOMOL",
    description: "OOMOL CLI",
    dependencies: {
        zod: "^4.3.6",
    },
    bin: {
        oo: "./index.ts",
    },
    peerDependencies: {
        typescript: "^5",
    },
    type: "module",
    scripts: {
        dev: "bun run index.ts",
    },
    license: "MIT",
    module: "index.ts",
});

const transientCompileRetryCount = 5;
const transientCompileRetryDelayMs = 1_000;
const compiledBinaryInstallTestTimeoutMs = 20_000;
const compiledBinaryInstallTest = process.platform === "win32" ? test.skip : test;

describe("npm-packages", () => {
    test("builds the wrapper package manifest with optional platform packages", () => {
        const wrapperManifestContent = buildWrapperPackageManifest(baseManifest, "1.2.3");
        const wrapperManifest = JSON.parse(wrapperManifestContent) as {
            bin: Record<string, string>;
            files: string[];
            optionalDependencies: Record<string, string>;
            scripts: Record<string, string>;
            type: string;
            version: string;
        };

        expect(wrapperManifest.version).toBe("1.2.3");
        expect(wrapperManifest.type).toBe("commonjs");
        expect(wrapperManifest.bin).toEqual({
            oo: "./bin/oo.cjs",
        });
        expect(wrapperManifest.files).toContain("bin/postinstall.cjs");
        expect(wrapperManifest.files).toContain("bin/platform-targets.json");
        expect(wrapperManifest.scripts).toEqual({
            postinstall: "node ./bin/postinstall.cjs",
        });
        expect(wrapperManifest.optionalDependencies).toEqual(
            Object.fromEntries(
                getPlatformTargets().map(target => [target.packageName, "1.2.3"]),
            ),
        );
        expect(Object.keys(JSON.parse(wrapperManifestContent) as Record<string, unknown>)).toEqual([
            "name",
            "type",
            "version",
            "private",
            "description",
            "author",
            "license",
            "repository",
            "keywords",
            "bin",
            "files",
            "scripts",
            "main",
            "engines",
            "optionalDependencies",
            "publishConfig",
        ]);
    });

    test("builds the platform package manifest for a musl binary", () => {
        const muslTarget = getPlatformTargets().find(
            target => target.id === "linux-x64-musl",
        );

        if (!muslTarget) {
            throw new Error("linux-x64-musl target is required for this test.");
        }

        const platformManifestContent = buildPlatformPackageManifest(
            baseManifest,
            "1.2.3",
            muslTarget,
        );
        const platformManifest = JSON.parse(platformManifestContent) as {
            cpu: string[];
            files: string[];
            libc?: string[];
            name: string;
            os: string[];
            version: string;
        };

        expect(platformManifest.name).toBe("@oomol-lab/oo-cli-linux-x64-musl");
        expect(platformManifest.version).toBe("1.2.3");
        expect(platformManifest.os).toEqual(["linux"]);
        expect(platformManifest.cpu).toEqual(["x64"]);
        expect(platformManifest.libc).toEqual(["musl"]);
        expect(platformManifest.files).toEqual(["bin/oo"]);
        expect(Object.keys(JSON.parse(platformManifestContent) as Record<string, unknown>)).toEqual([
            "name",
            "version",
            "private",
            "description",
            "author",
            "license",
            "repository",
            "keywords",
            "files",
            "os",
            "cpu",
            "libc",
            "publishConfig",
        ]);
    });

    test("rejects an empty release version", () => {
        expect(() => buildWrapperPackageManifest(baseManifest, "")).toThrow(
            "RELEASE_VERSION is required.",
        );
    });

    test("uses the explicit field order even when the source manifest order changes", () => {
        const wrapperManifestContent = buildWrapperPackageManifest(
            reorderedBaseManifest,
            "1.2.3",
        );

        expect(Object.keys(JSON.parse(wrapperManifestContent) as Record<string, unknown>)).toEqual([
            "name",
            "type",
            "version",
            "private",
            "description",
            "author",
            "license",
            "repository",
            "keywords",
            "bin",
            "files",
            "scripts",
            "main",
            "engines",
            "optionalDependencies",
            "publishConfig",
        ]);
    });

    test("uses the package manifest version when no release override is provided", () => {
        expect(resolvePackageVersion(baseManifest, undefined)).toBe(
            "0.0.0-development",
        );
    });

    test("allows the build script to narrow the selected platform targets", () => {
        expect(selectPlatformTargets(["darwin-arm64", "linux-x64-musl"])).toEqual(
            getPlatformTargets().filter(target =>
                target.id === "darwin-arm64" || target.id === "linux-x64-musl",
            ),
        );
    });

    test("parses comma-separated build targets from the environment", () => {
        expect(parseBuildTargetIds(" darwin-arm64, linux-x64-musl ,win32-x64 ")).toEqual([
            "darwin-arm64",
            "linux-x64-musl",
            "win32-x64",
        ]);
        expect(parseBuildTargetIds("")).toBeUndefined();
    });

    test("resolves platform presets without depending on shell env syntax", () => {
        expect(resolveBuildTargetIdsForPreset("windows")).toEqual(
            getPlatformTargets()
                .filter(target => target.os === "win32")
                .map(target => target.id),
        );
        expect(resolveBuildTargetIdsForPreset("macos")).toEqual(
            getPlatformTargets()
                .filter(target => target.os === "darwin")
                .map(target => target.id),
        );
        expect(resolveBuildTargetIdsForPreset("linux")).toEqual(
            getPlatformTargets()
                .filter(target => target.os === "linux")
                .map(target => target.id),
        );
    });

    test("resolves the current-platform preset from the runtime", () => {
        expect(
            resolveBuildTargetIdsForPreset("current-platform", {
                arch: "x64",
                platform: "linux",
                report: {
                    getReport: () => ({
                        header: {
                            glibcVersionRuntime: "2.39",
                        },
                    }),
                },
            }),
        ).toEqual(["linux-x64-gnu"]);
    });

    test("builds define arguments for compile-time metadata", () => {
        expect(
            buildCompileDefineArgs({
                buildTimestamp: 1_742_867_323_456,
                gitCommit: "1234567890abcdef",
                version: "1.2.3",
            }),
        ).toEqual([
            "--define",
            "BUILD_VERSION=\"1.2.3\"",
            "--define",
            "BUILD_TIMESTAMP=1742867323456",
            "--define",
            "GIT_COMMIT=\"1234567890abcdef\"",
        ]);
    });

    test("builds compile command arguments with the production executable flags", () => {
        expect(
            buildCompileCommandArgs(
                getRequiredTarget("darwin-arm64"),
                {
                    buildTimestamp: 1_742_867_323_456,
                    gitCommit: "1234567890abcdef",
                    version: "1.2.3",
                },
                "dist/bin/oo",
            ),
        ).toEqual([
            "bun",
            "build",
            "--compile",
            "--bytecode",
            "--format",
            "esm",
            "--minify",
            "--no-compile-autoload-dotenv",
            "--no-compile-autoload-bunfig",
            "--asset-naming=[name]-[hash].[ext]",
            "--target=bun-darwin-arm64",
            "--define",
            "BUILD_VERSION=\"1.2.3\"",
            "--define",
            "BUILD_TIMESTAMP=1742867323456",
            "--define",
            "GIT_COMMIT=\"1234567890abcdef\"",
            "./index.ts",
            "--outfile",
            "dist/bin/oo",
        ]);
    });

    test("assembles staged platform packages into release artifacts", async () => {
        const rootDirectoryPath = process.cwd();
        const temporaryDirectoryPath = await createTemporaryDirectory(
            "oo-assemble-release-artifacts",
        );
        const outDirectoryPath = join(temporaryDirectoryPath, "dist");
        const extractDirectoryPath = join(temporaryDirectoryPath, "extract");
        const stagingDirectoryPath = join(
            outDirectoryPath,
            releasePackagesDirectoryName,
        );
        const releaseVersion = "1.2.3";
        const targetIds = ["darwin-arm64", "win32-x64"] as const;

        try {
            await Promise.all(
                targetIds.map(targetId =>
                    writeStagedPlatformPackageFixture({
                        releaseVersion,
                        stagingDirectoryPath,
                        targetId,
                    }),
                ),
            );

            const tarballPaths = await assembleReleaseArtifacts({
                outDir: outDirectoryPath,
                releaseVersion,
                rootDir: rootDirectoryPath,
                targetIds,
            });

            expect(tarballPaths).toHaveLength(3);
            expect(tarballPaths[0]).toContain("darwin-arm64");
            expect(tarballPaths[1]).toContain("win32-x64");
            expect(tarballPaths[2]).toContain("oo-cli-1.2.3.tgz");

            expect(
                await readFile(join(outDirectoryPath, "npm-publish-order.txt"), "utf8"),
            ).toBe(`${tarballPaths.join("\n")}\n`);
            expect(
                await readFile(join(outDirectoryPath, "github-release-assets.txt"), "utf8"),
            ).toBe(
                `${[...tarballPaths, join(outDirectoryPath, releaseBundleFileName)].join("\n")}\n`,
            );

            const archive = new Bun.Archive(
                await Bun.file(join(outDirectoryPath, releaseBundleFileName)).bytes(),
            );
            await archive.extract(extractDirectoryPath);

            expect(
                await readFile(join(extractDirectoryPath, releaseBundleLatestFileName), "utf8"),
            ).toBe(buildReleaseBundleLatestMetadata(releaseVersion));

            for (const targetId of targetIds) {
                const target = getRequiredTarget(targetId);
                expect(
                    await readFile(
                        join(
                            extractDirectoryPath,
                            releaseVersion,
                            resolveReleaseBundleTargetDirectory(target.id),
                            target.executableFileName,
                        ),
                        "utf8",
                    ),
                ).toBe(`${target.id}\n`);
            }
        }
        finally {
            await rm(temporaryDirectoryPath, { force: true, recursive: true });
        }
    });

    test("rejects release assembly when a requested target was not staged", async () => {
        const rootDirectoryPath = process.cwd();
        const temporaryDirectoryPath = await createTemporaryDirectory(
            "oo-assemble-release-artifacts-missing-target",
        );
        const outDirectoryPath = join(temporaryDirectoryPath, "dist");
        const stagingDirectoryPath = join(
            outDirectoryPath,
            releasePackagesDirectoryName,
        );

        try {
            await writeStagedPlatformPackageFixture({
                releaseVersion: "1.2.3",
                stagingDirectoryPath,
                targetId: "darwin-arm64",
            });

            await expect(
                assembleReleaseArtifacts({
                    outDir: outDirectoryPath,
                    releaseVersion: "1.2.3",
                    rootDir: rootDirectoryPath,
                    targetIds: ["darwin-arm64", "win32-x64"],
                }),
            ).rejects.toThrow("Missing staged package for target: win32-x64");
        }
        finally {
            await rm(temporaryDirectoryPath, { force: true, recursive: true });
        }
    });

    compiledBinaryInstallTest(
        "compiled binary installs bundled skills to stable file paths",
        async () => {
            const rootDirectoryPath = process.cwd();
            const temporaryDirectoryPath = await createTemporaryDirectory(
                "oo-compiled-bundled-skills",
            );
            const currentTarget = resolveCurrentPlatformTarget();
            const executablePath = join(
                temporaryDirectoryPath,
                currentTarget.executableFileName,
            );
            const codexHomeDirectoryPath = join(temporaryDirectoryPath, "codex-home");
            const configHomeDirectoryPath = join(temporaryDirectoryPath, "config-home");
            const homeDirectoryPath = join(temporaryDirectoryPath, "home");

            try {
                await compileExecutableWithTransientRetry({
                    outputPath: executablePath,
                    runCompile: () =>
                        Bun.spawnSync(
                            buildCompileCommandArgs(
                                currentTarget,
                                {
                                    buildTimestamp: 1_742_867_323_456,
                                    gitCommit: "1234567890abcdef",
                                    version: "1.2.3",
                                },
                                executablePath,
                            ),
                            {
                                cwd: rootDirectoryPath,
                                stderr: "pipe",
                                stdin: "ignore",
                                stdout: "pipe",
                            },
                        ),
                });

                if (process.platform !== "win32") {
                    await chmod(executablePath, 0o755);
                }

                await Promise.all([
                    mkdir(codexHomeDirectoryPath, { recursive: true }),
                    mkdir(configHomeDirectoryPath, { recursive: true }),
                    mkdir(homeDirectoryPath, { recursive: true }),
                ]);

                const installResult = Bun.spawnSync(
                    [executablePath, "skills", "add"],
                    {
                        cwd: rootDirectoryPath,
                        env: {
                            ...process.env,
                            CODEX_HOME: codexHomeDirectoryPath,
                            HOME: homeDirectoryPath,
                            XDG_CONFIG_HOME: configHomeDirectoryPath,
                        },
                        stderr: "pipe",
                        stdin: "ignore",
                        stdout: "pipe",
                    },
                );

                if (installResult.exitCode !== 0) {
                    throw new Error(decodeOutput(installResult.stderr));
                }

                const installedSkillDirectoryPath = join(
                    codexHomeDirectoryPath,
                    "skills",
                    "oo-find-skills",
                );

                for (const file of getBundledSkillFiles("oo-find-skills", "codex")) {
                    expect(
                        await readFile(
                            join(installedSkillDirectoryPath, file.relativePath),
                            "utf8",
                        ),
                    ).toBe(await Bun.file(file.sourcePath).text());
                }
            }
            finally {
                await rm(temporaryDirectoryPath, { force: true, recursive: true });
            }
        },
        compiledBinaryInstallTestTimeoutMs,
    );

    test("retries transient Bun baseline extraction failures before succeeding", async () => {
        let attemptCount = 0;
        let cleanupCount = 0;
        let sleepCount = 0;

        await compileExecutableWithTransientRetry({
            outputPath: "ignored-output",
            runCompile: () => {
                attemptCount += 1;

                if (attemptCount < transientCompileRetryCount) {
                    return createCompileSpawnResult({
                        errorOutput: [
                            "error: Failed to extract executable for 'bun-windows-aarch64-v1.3.13'.",
                            "The download may be incomplete.",
                        ].join(" "),
                    });
                }

                return createCompileSpawnResult({});
            },
            removeOutput: async () => {
                cleanupCount += 1;
            },
            retryCount: transientCompileRetryCount,
            retryDelayMs: transientCompileRetryDelayMs,
            sleep: async () => {
                sleepCount += 1;
            },
        });

        expect(attemptCount).toBe(transientCompileRetryCount);
        expect(cleanupCount).toBe(transientCompileRetryCount - 1);
        expect(sleepCount).toBe(transientCompileRetryCount - 1);
    });

    test("does not retry non-transient compile failures", async () => {
        let attemptCount = 0;
        let cleanupCount = 0;

        await expect(
            compileExecutableWithTransientRetry({
                outputPath: "ignored-output",
                runCompile: () => {
                    attemptCount += 1;

                    return createCompileSpawnResult({
                        errorOutput: "error: Could not resolve './missing-entry.ts'.",
                    });
                },
                removeOutput: async () => {
                    cleanupCount += 1;
                },
                retryCount: transientCompileRetryCount,
                retryDelayMs: transientCompileRetryDelayMs,
                sleep: async () => undefined,
            }),
        ).rejects.toThrow("Could not resolve './missing-entry.ts'.");

        expect(attemptCount).toBe(1);
        expect(cleanupCount).toBe(0);
    });

    test("rejects unsupported build targets", () => {
        expect(() => selectPlatformTargets(["unknown-target"])).toThrow(
            "Unsupported build target: unknown-target",
        );
    });

    test("resolves the current platform target for darwin arm64", () => {
        const expectedTarget = getRequiredTarget("darwin-arm64");

        expect(
            resolveCurrentPlatformTarget({
                arch: "arm64",
                platform: "darwin",
            }),
        ).toEqual(expectedTarget);
    });

    test("resolves the current platform target for linux x64 glibc", () => {
        const expectedTarget = getRequiredTarget("linux-x64-gnu");

        expect(
            resolveCurrentPlatformTarget({
                arch: "x64",
                platform: "linux",
                report: {
                    getReport: () => ({
                        header: {
                            glibcVersionRuntime: "2.39",
                        },
                    }),
                },
            }),
        ).toEqual(expectedTarget);
    });

    test("resolves the current platform target for linux x64 musl", () => {
        const expectedTarget = getRequiredTarget("linux-x64-musl");

        expect(
            resolveCurrentPlatformTarget({
                arch: "x64",
                platform: "linux",
                report: {
                    getReport: () => ({
                        header: {},
                    }),
                },
            }),
        ).toEqual(expectedTarget);
    });

    test("rejects unsupported current platforms", () => {
        expect(() =>
            resolveCurrentPlatformTarget({
                arch: "arm",
                platform: "linux",
                report: {
                    getReport: () => ({
                        header: {
                            glibcVersionRuntime: "2.39",
                        },
                    }),
                },
            }),
        ).toThrow("No build target is configured for linux arm glibc.");
    });
});

function getRequiredTarget(targetId: string) {
    const matchedTarget = getPlatformTargets().find(target => target.id === targetId);

    if (!matchedTarget) {
        throw new Error(`Missing target for test: ${targetId}`);
    }

    return matchedTarget;
}

async function writeStagedPlatformPackageFixture(options: {
    releaseVersion: string;
    stagingDirectoryPath: string;
    targetId: string;
}): Promise<void> {
    const target = getRequiredTarget(options.targetId);
    const packageDirectoryPath = join(options.stagingDirectoryPath, target.id);

    await mkdir(packageDirectoryPath, { recursive: true });
    await Promise.all([
        Bun.write(
            join(packageDirectoryPath, "package.json"),
            buildPlatformPackageManifest(
                baseManifest,
                options.releaseVersion,
                target,
            ),
        ),
        writeReleaseBundleBinaryFixture(
            options.stagingDirectoryPath,
            target.id,
            target.executableFileName,
        ),
    ]);
}

function createCompileSpawnResult(options: {
    errorOutput?: string;
    exitCode?: number;
}): CompileSpawnResult {
    return {
        exitCode: options.exitCode ?? (options.errorOutput === undefined ? 0 : 1),
        stderr: new TextEncoder().encode(options.errorOutput ?? ""),
    };
}
