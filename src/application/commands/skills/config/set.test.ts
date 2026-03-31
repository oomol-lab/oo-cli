import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../../config/app-config.ts";
import { resolveCodexHomeDirectory } from "../bundled-skill-paths.ts";
import { getBundledSkillFiles } from "../embedded-assets.ts";

describe("skills config set command", () => {
    test("persists the oo skill config without requiring Codex", async () => {
        const sandbox = await createCliSandbox();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });

        try {
            const result = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "allow-implicit-invocation",
                "false",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                "Set Codex skill oo allow-implicit-invocation to false.\n",
            );
            expect(await readFile(storePaths.settingsFilePath, "utf8")).toContain(
                "[skills.oo]",
            );
            expect(await readFile(storePaths.settingsFilePath, "utf8")).toContain(
                "implicit_invocation = false",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("updates the installed managed skill when the skill config changes", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                ownershipFilePath,
                await Bun.file(
                    getBundledSkillFiles("oo").find(file => file.relativePath === "agents/openai.yaml")!.sourcePath,
                ).text(),
            );

            const result = await sandbox.run([
                "skills",
                "config",
                "set",
                "oo",
                "allow-implicit-invocation",
                "false",
            ]);

            expect(result.exitCode).toBe(0);
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: false",
            );
            expect(await readFile(
                resolveStorePaths({
                    appName: APP_NAME,
                    env: sandbox.env,
                    platform: process.platform,
                }).settingsFilePath,
                "utf8",
            )).toContain("implicit_invocation = false");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
