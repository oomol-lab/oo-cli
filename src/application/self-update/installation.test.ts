import { describe, expect, test } from "bun:test";
import { detectInstallationMethodFromExecPath } from "./installation.ts";
import {
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionFilePath,
} from "./paths.ts";

describe("detectInstallationMethodFromExecPath", () => {
    test("returns explicit native for the managed executable entrypoint path", () => {
        const env = {
            HOME: "/tmp/home",
        };
        const paths = resolveSelfUpdatePaths({
            env,
            platform: "linux",
        });

        expect(detectInstallationMethodFromExecPath({
            env,
            execPath: paths.executablePath,
            platform: "linux",
        })).toEqual({
            confidence: "explicit",
            method: "native",
            source: "managedPath",
        });
    });

    test("returns explicit native for a managed version file path", () => {
        const env = {
            HOME: "/tmp/home",
        };
        const paths = resolveSelfUpdatePaths({
            env,
            platform: "linux",
        });

        expect(detectInstallationMethodFromExecPath({
            env,
            execPath: resolveSelfUpdateVersionFilePath(paths, "1.2.3"),
            platform: "linux",
        })).toEqual({
            confidence: "explicit",
            method: "native",
            source: "managedPath",
        });
    });

    test("returns an inferred package manager for a recognized exec path", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toEqual({
            confidence: "inferred",
            method: "pnpm",
            source: "execPath",
        });
    });

    test("returns unknown when neither managed nor package-manager paths match", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/opt/oo/bin/oo",
            platform: "linux",
        })).toEqual({
            confidence: "unknown",
            method: "unknown",
            source: "unknown",
        });
    });

    test("detects bun from an exact path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.bun/install/global/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        }).method).toBe("bun");
    });

    test("detects pnpm from an exact path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        }).method).toBe("pnpm");
    });

    test("detects yarn from an exact path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.config/yarn/global/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        }).method).toBe("yarn");
    });

    test("falls back to npm for packaged oo executables in node_modules", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli-linux-x64/bin/oo",
            platform: "linux",
        }).method).toBe("npm");
    });

    test("detects npm from an exact npm_global path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.config/yarn/global/npm_global/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        }).method).toBe("npm");
    });

    test("detects npm from an exact .nvm path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.nvm/versions/node/v22.0.0/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        }).method).toBe("npm");
    });

    test("does not match unrelated path segments by substring", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/aabunxx/tools/yarn-helper/node_modules/@oomol-lab/not-oo/bin/oo",
            platform: "linux",
        }).method).toBe("unknown");
    });
});
