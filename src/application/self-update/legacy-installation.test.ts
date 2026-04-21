import { describe, expect, test } from "bun:test";
import { createLogCapture } from "../../../__tests__/helpers.ts";
import { attemptLegacyPackageManagerUninstall } from "./legacy-installation.ts";

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
                env: {},
                execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
                logger: logCapture.logger,
                platform: "linux",
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
                env: {},
                execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
                logger: logCapture.logger,
                platform: "linux",
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
