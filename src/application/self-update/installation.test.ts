import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { detectInstallationMethodFromExecPath } from "./installation.ts";
import {
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionDirectoryPath,
    resolveSelfUpdateVersionExecutablePath,
} from "./paths.ts";

describe("detectInstallationMethodFromExecPath", () => {
    test("returns native for the managed executable entrypoint path", () => {
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
        })).toBe("native");
    });

    test("returns native for a managed version executable path", () => {
        const env = {
            HOME: "/tmp/home",
        };
        const paths = resolveSelfUpdatePaths({
            env,
            platform: "linux",
        });

        expect(detectInstallationMethodFromExecPath({
            env,
            execPath: resolveSelfUpdateVersionExecutablePath(paths, "1.2.3"),
            platform: "linux",
        })).toBe("native");
    });

    test("returns native for a legacy managed version file path", () => {
        const env = {
            HOME: "/tmp/home",
        };
        const paths = resolveSelfUpdatePaths({
            env,
            platform: "linux",
        });

        expect(detectInstallationMethodFromExecPath({
            env,
            execPath: resolveSelfUpdateVersionDirectoryPath(paths, "1.2.3"),
            platform: "linux",
        })).toBe("native");
    });

    test("returns the package manager for a recognized exec path", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toBe("pnpm");
    });

    test("returns unknown when neither managed nor package-manager paths match", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/opt/oo/bin/oo",
            platform: "linux",
        })).toBe("unknown");
    });

    test("detects bun from an exact path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.bun/install/global/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toBe("bun");
    });

    test("detects pnpm from an exact path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toBe("pnpm");
    });

    test("detects yarn from an exact path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.config/yarn/global/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toBe("yarn");
    });

    test("falls back to npm for packaged oo executables in node_modules", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli-linux-x64/bin/oo",
            platform: "linux",
        })).toBe("npm");
    });

    test("detects npm from an exact npm_global path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.config/yarn/global/npm_global/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toBe("npm");
    });

    test("detects npm from an exact npm-global path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: join(
                "Users",
                "demo",
                "Library",
                "Application Support",
                "QClaw",
                "npm-global",
                "bin",
                "oo",
            ),
            platform: "linux",
        })).toBe("npm");
    });

    test("detects npm from an exact .nvm path segment", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/.nvm/versions/node/v22.0.0/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
            platform: "linux",
        })).toBe("npm");
    });

    test("does not match unrelated path segments by substring", () => {
        expect(detectInstallationMethodFromExecPath({
            env: {},
            execPath: "/Users/demo/aabunxx/tools/yarn-helper/node_modules/@oomol-lab/not-oo/bin/oo",
            platform: "linux",
        })).toBe("unknown");
    });
});
