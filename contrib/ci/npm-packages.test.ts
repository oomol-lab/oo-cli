import { describe, expect, test } from "bun:test";

import {
    buildPlatformPackageManifest,
    buildWrapperPackageManifest,
    getPlatformTargets,
    resolveCurrentPlatformTarget,
    resolvePackageVersion,
    selectPlatformTargets,
} from "./npm-packages.ts";

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
