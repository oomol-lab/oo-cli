import { createRequire } from "node:module";

import { describe, expect, test } from "bun:test";

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

interface LoaderLike {
    resolve: (specifier: string) => string;
}

const require = createRequire(import.meta.url);
const runtimeModule = require("./platform-runtime.cjs") as {
    detectLinuxLibc: (runtime?: RuntimeLike) => string | undefined;
    platformTargets: Array<{
        cpu: string;
        executableFileName: string;
        id: string;
        libc?: string;
        os: string;
        packageName: string;
    }>;
    resolveExecutablePath: (
        loader?: LoaderLike,
        runtime?: RuntimeLike,
    ) => string;
    resolvePlatformTarget: (runtime?: RuntimeLike) => {
        cpu: string;
        executableFileName: string;
        id: string;
        libc?: string;
        os: string;
        packageName: string;
    } | undefined;
};

describe("platform-runtime", () => {
    test("detects glibc on Linux when the runtime report includes a glibc version", () => {
        expect(
            runtimeModule.detectLinuxLibc({
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
        ).toBe("glibc");
    });

    test("treats Linux without a glibc runtime version as musl", () => {
        expect(
            runtimeModule.detectLinuxLibc({
                arch: "x64",
                platform: "linux",
                report: {
                    getReport: () => ({
                        header: {},
                    }),
                },
            }),
        ).toBe("musl");
    });

    test("resolves the current target for darwin arm64", () => {
        expect(
            runtimeModule.resolvePlatformTarget({
                arch: "arm64",
                platform: "darwin",
            }),
        ).toEqual(
            runtimeModule.platformTargets.find(target => target.id === "darwin-arm64"),
        );
    });

    test("resolves the executable path from the matching optional package", () => {
        expect(
            runtimeModule.resolveExecutablePath(
                {
                    resolve: specifier => `/mock/${specifier}`,
                },
                {
                    arch: "x64",
                    platform: "linux",
                    report: {
                        getReport: () => ({
                            header: {
                                glibcVersionRuntime: "2.39",
                            },
                        }),
                    },
                },
            ),
        ).toBe("/mock/@oomol-lab/oo-cli-linux-x64-gnu/bin/oo");
    });

    test("surfaces a helpful install error when the optional package is missing", () => {
        expect(() =>
            runtimeModule.resolveExecutablePath(
                {
                    resolve: () => {
                        throw new Error("Cannot find module");
                    },
                },
                {
                    arch: "arm64",
                    platform: "darwin",
                },
            ),
        ).toThrow("Reinstall @oomol-lab/oo-cli without --omit=optional or --no-optional.");
    });
});
