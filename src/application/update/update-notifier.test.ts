import { Ansis } from "ansis";
import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../__tests__/helpers.ts";
import {
    compareReleaseVersions,
    resolvePackageManagerUpgradeCommand,
} from "./update-notifier.ts";

const packageName = "@oomol-lab/oo-cli";

describe("update notifier", () => {
    test("compares stable and prerelease versions", () => {
        expect(compareReleaseVersions("1.2.4", "1.2.3")).toBe(1);
        expect(compareReleaseVersions("1.2.3", "1.2.3")).toBe(0);
        expect(compareReleaseVersions("1.2.3", "1.2.4")).toBe(-1);
        expect(compareReleaseVersions("1.2.3", "1.2.3-beta.1")).toBe(1);
        expect(compareReleaseVersions("1.2.3-beta.2", "1.2.3-beta.10")).toBe(-1);
    });

    test("resolves package-manager-specific upgrade commands", () => {
        expect(resolvePackageManagerUpgradeCommand({
            OO_INSTALL_PACKAGE_MANAGER: "bun",
            npm_config_user_agent: "pnpm/10.0.0 node/v22.0.0",
        }, packageName)).toBe(`bun install -g ${packageName}@latest`);
        expect(resolvePackageManagerUpgradeCommand({
            npm_config_user_agent: "pnpm/10.0.0 node/v22.0.0",
        }, packageName)).toBe(`pnpm add -g ${packageName}@latest`);
        expect(resolvePackageManagerUpgradeCommand({
            npm_config_user_agent: "bun/1.3.0 npm/? node/v22.0.0",
        }, packageName)).toBe(`bun install -g ${packageName}@latest`);
        expect(resolvePackageManagerUpgradeCommand({}, packageName)).toBe(
            `npm install -g ${packageName}@latest`,
        );
    });

    test("prints an update notice once per discovered release", async () => {
        const sandbox = await createCliSandbox();
        let fetchCount = 0;

        try {
            sandbox.env.npm_config_user_agent = "pnpm/10.0.0 node/v22.0.0";
            const fetcher = async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    "dist-tags": {
                        latest: "1.2.0",
                    },
                }));
            };
            const firstResult = await sandbox.run(
                ["config", "path"],
                {
                    fetcher,
                    packageName,
                    stderr: {
                        hasColors: true,
                        isTTY: true,
                    },
                    version: "1.0.0",
                },
            );
            const secondResult = await sandbox.run(
                ["config", "path"],
                {
                    fetcher,
                    packageName,
                    stderr: {
                        hasColors: true,
                        isTTY: true,
                    },
                    version: "1.0.0",
                },
            );
            const strippedOutput = new Ansis(3).strip(firstResult.stderr);

            expect(firstResult.exitCode).toBe(0);
            expect(firstResult.stderr).toContain("\u001B[");
            expect(strippedOutput).toContain(
                "Update available 1.0.0 → 1.2.0",
            );
            expect(strippedOutput).toContain(
                `Run pnpm add -g ${packageName}@latest to update`,
            );
            expect(strippedOutput).toContain("╭");
            expect(strippedOutput).toContain("╯");
            expect(secondResult.stderr).toBe("");
            expect(fetchCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not print an update notice when disabled in config", async () => {
        const sandbox = await createCliSandbox();
        let fetchCount = 0;

        try {
            const fetcher = async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    "dist-tags": {
                        latest: "1.2.0",
                    },
                }));
            };
            const setResult = await sandbox.run(
                ["config", "set", "update-notifier", "off"],
                {
                    fetcher,
                    packageName,
                    stderr: {
                        isTTY: true,
                    },
                    version: "1.0.0",
                },
            );
            const getResult = await sandbox.run(
                ["config", "get", "update-notifier"],
                {
                    fetcher,
                    packageName,
                    stderr: {
                        isTTY: true,
                    },
                    version: "1.0.0",
                },
            );

            expect(setResult.exitCode).toBe(0);
            expect(setResult.stdout).toContain("Set update-notifier to off.");
            expect(setResult.stderr).toBe("");
            expect(getResult.stdout).toBe("off\n");
            expect(getResult.stderr).toBe("");
            expect(fetchCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
