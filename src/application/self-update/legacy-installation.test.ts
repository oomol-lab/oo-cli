import { describe, expect, test } from "bun:test";
import { createLogCapture } from "../../../__tests__/helpers.ts";
import {
    attemptLegacyPackageManagerUninstall,
    detectLegacyPackageManager,
} from "./legacy-installation.ts";

describe("detectLegacyPackageManager", () => {
    test("prefers the wrapper-provided package manager when available", () => {
        expect(detectLegacyPackageManager({
            env: {
                OO_INSTALL_PACKAGE_MANAGER: "yarn",
            },
            execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
        })).toBe("yarn");
    });

    test("detects bun from an exact path segment", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/Users/demo/.bun/install/global/node_modules/@oomol-lab/oo-cli/bin/oo",
        })).toBe("bun");
    });

    test("detects pnpm from an exact path segment", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
        })).toBe("pnpm");
    });

    test("detects yarn from an exact path segment", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/Users/demo/.config/yarn/global/node_modules/@oomol-lab/oo-cli/bin/oo",
        })).toBe("yarn");
    });

    test("falls back to npm for packaged oo executables in node_modules", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli-linux-x64/bin/oo",
        })).toBe("npm");
    });

    test("detects npm from an exact npm_global path segment", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/Users/demo/.config/yarn/global/npm_global/node_modules/@oomol-lab/oo-cli/bin/oo",
        })).toBe("npm");
    });

    test("detects npm from an exact .nvm path segment", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/Users/demo/.nvm/versions/node/v22.0.0/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
        })).toBe("npm");
    });

    test("does not match unrelated path segments by substring", () => {
        expect(detectLegacyPackageManager({
            env: {},
            execPath: "/Users/demo/aabunxx/tools/yarn-helper/node_modules/@oomol-lab/not-oo/bin/oo",
        })).toBeUndefined();
    });
});

describe("attemptLegacyPackageManagerUninstall", () => {
    test("runs the matching package manager uninstall command", async () => {
        const logCapture = createLogCapture();
        const commands: Array<{
            commandArguments: readonly string[];
            commandPath: string;
            timeoutMs: number;
        }> = [];

        try {
            await attemptLegacyPackageManagerUninstall({
                env: {
                    OO_INSTALL_PACKAGE_MANAGER: "pnpm",
                },
                execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
                logger: logCapture.logger,
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: async (options) => {
                    commands.push({
                        commandArguments: options.commandArguments,
                        commandPath: options.commandPath,
                        timeoutMs: options.timeoutMs,
                    });

                    return {
                        exitCode: 0,
                        signalCode: null,
                        stderr: "",
                        stdout: "",
                    };
                },
            });

            expect(commands).toEqual([
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/pnpm",
                    timeoutMs: 10_000,
                },
            ]);
            expect(logCapture.read()).toContain("Legacy package-manager oo-cli uninstall completed.");
        }
        finally {
            logCapture.close();
        }
    });

    test("swallows uninstall failures and logs a warning", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(attemptLegacyPackageManagerUninstall({
                env: {
                    OO_INSTALL_PACKAGE_MANAGER: "npm",
                },
                execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
                logger: logCapture.logger,
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: async () => ({
                    exitCode: 1,
                    signalCode: null,
                    stderr: "permission denied",
                    stdout: "",
                }),
            })).resolves.toBeUndefined();

            expect(logCapture.read()).toContain("Legacy package-manager oo-cli uninstall failed.");
            expect(logCapture.read()).toContain("permission denied");
        }
        finally {
            logCapture.close();
        }
    });
});
