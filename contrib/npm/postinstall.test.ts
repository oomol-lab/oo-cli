import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const postinstallModule = require("./postinstall.cjs") as {
    detectPackageManager: (env?: Record<string, string | undefined>) => string | undefined;
    detectPackageManagerFromExecPath: (rawValue: unknown) => string | undefined;
    parsePackageManagerToken: (rawValue: unknown) => string | undefined;
    writeInstallContextFile: (options?: {
        baseDirectory?: string;
        env?: Record<string, string | undefined>;
    }) => boolean;
};

const createdDirectories: string[] = [];

afterEach(async () => {
    for (const directory of createdDirectories.splice(0)) {
        await Bun.$`rm -rf ${directory}`;
    }
});

describe("postinstall", () => {
    test("detects the package manager from npm_config_user_agent", () => {
        expect(postinstallModule.detectPackageManager({
            npm_config_user_agent: "pnpm/10.0.0 node/v22.0.0",
        })).toBe("pnpm");
        expect(postinstallModule.detectPackageManager({
            npm_config_user_agent: "bun/1.3.0 npm/? node/v22.0.0",
        })).toBe("bun");
        expect(postinstallModule.detectPackageManager({
            npm_config_user_agent: "yarn/1.22.0 npm/? node/v22.0.0",
        })).toBe("yarn");
    });

    test("writes the install context file for supported package managers", async () => {
        const directory = await mkdtemp(join(tmpdir(), "oo-postinstall-"));
        createdDirectories.push(directory);

        expect(postinstallModule.writeInstallContextFile({
            baseDirectory: directory,
            env: {
                npm_config_user_agent: "bun/1.3.0 npm/? node/v22.0.0",
            },
        })).toBeTrue();
        expect(await readFile(join(directory, "install-context.json"), "utf8")).toBe(
            "{\n  \"packageManager\": \"bun\"\n}\n",
        );
    });

    test("does not match unrelated exec paths by substring", () => {
        expect(
            postinstallModule.detectPackageManagerFromExecPath(
                "/Users/demo/aabunxx/bin/custom-cli.js",
            ),
        ).toBeUndefined();
        expect(
            postinstallModule.detectPackageManagerFromExecPath(
                "/Users/demo/tools/pnpm-helper.js",
            ),
        ).toBeUndefined();
        expect(
            postinstallModule.detectPackageManagerFromExecPath(
                "/Users/demo/bin/npm-cli.js",
            ),
        ).toBe("npm");
    });

    test("skips writing the install context file when the package manager is unknown", async () => {
        const directory = await mkdtemp(join(tmpdir(), "oo-postinstall-"));
        createdDirectories.push(directory);

        expect(postinstallModule.parsePackageManagerToken("custom/1.0.0")).toBeUndefined();
        expect(postinstallModule.writeInstallContextFile({
            baseDirectory: directory,
            env: {
                npm_config_user_agent: "custom/1.0.0 node/v22.0.0",
            },
        })).toBeFalse();
    });
});
