import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    defaultSettingsFileContent,
    readLatestLogContent,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveBundledSkillVersionFilePath,
    resolveCodexHomeDirectory,
} from "../skills/shared.ts";

describe("config CLI", () => {
    test("writes settings-store and config mutation logs", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["config", "set", "lang", "zh"]);
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(content).toContain(
                `"msg":"Settings store file was missing. Initializing a default file."`,
            );
            expect(content).toContain(`"msg":"Settings store default file created."`);
            expect(content).toContain(`"msg":"Settings store write completed."`);
            expect(content).toContain(`"msg":"Config value persisted."`);
            expect(content).toContain(`"key":"lang"`);
            expect(content).toContain(`"value":"zh"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("persists the configured locale and allows explicit override", async () => {
        const sandbox = await createCliSandbox();

        try {
            const setResult = await sandbox.run(["config", "set", "lang", "zh"]);
            const persistedHelp = await sandbox.run(["--help"]);
            const overriddenHelp = await sandbox.run(["--lang", "en", "--help"]);

            expect(setResult.exitCode).toBe(0);
            expect(setResult.stdout).toContain("Set lang to zh.");
            expect(persistedHelp.stdout).not.toContain("用法：");
            expect(overriddenHelp.stdout).not.toContain("Usage:");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports config path list get set and unset", async () => {
        const sandbox = await createCliSandbox();

        try {
            const configPathResult = await sandbox.run(["config", "path"]);
            const listBeforeSetResult = await sandbox.run(["config", "list"]);
            const setResult = await sandbox.run(["config", "set", "lang", "zh"]);
            const listAfterSetResult = await sandbox.run(["config", "list"]);
            const getResult = await sandbox.run(["config", "get", "lang"]);
            const unsetResult = await sandbox.run(["config", "unset", "lang"]);
            const listAfterUnsetResult = await sandbox.run(["config", "list"]);
            const getAfterUnsetResult = await sandbox.run(["config", "get", "lang"]);

            expect(configPathResult.exitCode).toBe(0);
            expect(configPathResult.stdout).toBe(
                `${join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml")}\n`,
            );
            expect(listBeforeSetResult.exitCode).toBe(0);
            expect(listBeforeSetResult.stdout).toBe("");
            expect(setResult.exitCode).toBe(0);
            expect(listAfterSetResult.exitCode).toBe(0);
            expect(listAfterSetResult.stdout).toBe("lang=zh\n");
            expect(getResult.stdout).toBe("zh\n");
            expect(unsetResult.exitCode).toBe(0);
            expect(listAfterUnsetResult.exitCode).toBe(0);
            expect(listAfterUnsetResult.stdout).toBe("");
            expect(getAfterUnsetResult.stdout).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports the oo skill implicit invocation config key", async () => {
        const sandbox = await createCliSandbox();

        try {
            const setResult = await sandbox.run([
                "config",
                "set",
                "skills.oo.implicit_invocation",
                "false",
            ]);
            const listResult = await sandbox.run(["config", "list"]);
            const getResult = await sandbox.run([
                "config",
                "get",
                "skills.oo.implicit_invocation",
            ]);
            const unsetResult = await sandbox.run([
                "config",
                "unset",
                "skills.oo.implicit_invocation",
            ]);
            const getAfterUnsetResult = await sandbox.run([
                "config",
                "get",
                "skills.oo.implicit_invocation",
            ]);

            expect(setResult.exitCode).toBe(0);
            expect(setResult.stdout).toBe(
                "Set skills.oo.implicit_invocation to false.\n",
            );
            expect(listResult.stdout).toBe(
                "skills.oo.implicit_invocation=false\n",
            );
            expect(getResult.stdout).toBe("false\n");
            expect(unsetResult.exitCode).toBe(0);
            expect(getAfterUnsetResult.stdout).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports the file download output directory config key", async () => {
        const sandbox = await createCliSandbox();

        try {
            const setResult = await sandbox.run([
                "config",
                "set",
                "file.download.out_dir",
                "~/Downloads/reports",
            ]);
            const listResult = await sandbox.run(["config", "list"]);
            const getResult = await sandbox.run([
                "config",
                "get",
                "file.download.out_dir",
            ]);
            const unsetResult = await sandbox.run([
                "config",
                "unset",
                "file.download.out_dir",
            ]);
            const getAfterUnsetResult = await sandbox.run([
                "config",
                "get",
                "file.download.out_dir",
            ]);

            expect(setResult.exitCode).toBe(0);
            expect(setResult.stdout).toBe(
                "Set file.download.out_dir to ~/Downloads/reports.\n",
            );
            expect(listResult.stdout).toBe(
                "file.download.out_dir=~/Downloads/reports\n",
            );
            expect(getResult.stdout).toBe("~/Downloads/reports\n");
            expect(unsetResult.exitCode).toBe(0);
            expect(getAfterUnsetResult.stdout).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("config set immediately synchronizes the installed managed skill policy", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(versionFilePath, "9.9.9\n");
            await Bun.write(
                ownershipFilePath,
                await Bun.file(
                    join(process.cwd(), "contrib", "skills", "oo", "agents", "openai.yaml"),
                ).text(),
            );

            const result = await sandbox.run([
                "config",
                "set",
                "skills.oo.implicit_invocation",
                "false",
            ], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: false",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("config unset immediately restores the installed managed skill policy default", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");
        const versionFilePath = resolveBundledSkillVersionFilePath(skillDirectoryPath);
        const settingsFilePath = join(
            sandbox.env.XDG_CONFIG_HOME!,
            APP_NAME,
            "settings.toml",
        );

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(versionFilePath, "9.9.9\n");
            await Bun.write(
                ownershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Check OOMOL first for ready-made capabilities",
                    "  default_prompt: \"Use $oo when I ask for a ready-made capability.\"",
                    "",
                    "policy:",
                    "  allow_implicit_invocation: false",
                    "",
                    "# OOMOL",
                    "",
                ].join("\n"),
            );
            await Bun.write(
                settingsFilePath,
                [
                    "[skills.oo]",
                    "implicit_invocation = false",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run([
                "config",
                "unset",
                "skills.oo.implicit_invocation",
            ], {
                version: "9.9.9",
            });

            expect(result.exitCode).toBe(0);
            expect(await readFile(ownershipFilePath, "utf8")).toContain(
                "allow_implicit_invocation: true",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders config list help with configured wording", async () => {
        const sandbox = await createCliSandbox();

        try {
            const englishConfigHelp = await sandbox.run(["config", "--help"]);
            const englishListHelp = await sandbox.run(["config", "list", "--help"]);
            const chineseConfigHelp = await sandbox.run(["--lang", "zh", "config", "--help"]);
            const chineseListHelp = await sandbox.run(["--lang", "zh", "config", "list", "--help"]);

            expect(englishConfigHelp.exitCode).toBe(0);
            expect(englishConfigHelp.stdout).toContain("List configured values");
            expect(englishConfigHelp.stdout).toContain("Show config file path");

            expect(englishListHelp.exitCode).toBe(0);
            expect(englishListHelp.stdout).toContain(
                "Print all persisted configuration values that are currently configured.",
            );

            expect(chineseConfigHelp.exitCode).toBe(0);
            expect(chineseConfigHelp.stdout).toContain("查看已配置的配置值");
            expect(chineseConfigHelp.stdout).toContain("显示配置文件路径");

            expect(chineseListHelp.exitCode).toBe(0);
            expect(chineseListHelp.stdout).toContain("查看当前已配置的全部持久化配置值。");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("creates a default settings file on first read", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "settings.toml",
            );

            const result = await sandbox.run(["config", "list"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe("");
            expect(await readFile(filePath, "utf8")).toBe(defaultSettingsFileContent);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns usage errors for invalid config inputs", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidKey = await sandbox.run(["config", "get", "update-notifier"]);
            const invalidConfigValue = await sandbox.run(["config", "set", "lang", "fr"]);
            const invalidSkillPolicyValue = await sandbox.run([
                "config",
                "set",
                "skills.oo.implicit_invocation",
                "maybe",
            ]);

            expect(invalidKey.exitCode).toBe(2);
            expect(invalidKey.stderr).toContain("Invalid config key");
            expect(invalidKey.stderr).not.toContain("Supported keys");

            expect(invalidConfigValue.exitCode).toBe(2);
            expect(invalidConfigValue.stderr).toContain("Invalid lang value");

            expect(invalidSkillPolicyValue.exitCode).toBe(2);
            expect(invalidSkillPolicyValue.stderr).toContain(
                "Invalid skills.oo.implicit_invocation value",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns runtime errors when the persisted store is corrupted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "settings.toml",
            );

            await Bun.write(filePath, "{");

            const result = await sandbox.run(["config", "get", "lang"]);
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("settings file");
            expect(content).toContain(`"category":"system_error"`);
            expect(content).toContain(`"key":"errors.store.invalidToml"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reads TOML settings files", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "settings.toml",
            );

            await Bun.write(
                filePath,
                "lang = \"zh\"\n",
            );

            const result = await sandbox.run(["config", "get", "lang"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("zh\n");
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
