import { describe, expect, test } from "bun:test";

import { loadCliCatalog } from "./catalog.ts";

describe("loadCliCatalog", () => {
    test("loads every command in registration order without argv", async () => {
        const catalog = await loadCliCatalog();

        expect(catalog.commands.map(command => command.name)).toEqual([
            "auth",
            "check-update",
            "connector",
            "file",
            "flow",
            "info",
            "install",
            "__complete",
            "llm",
            "login",
            "logout",
            "team",
            "completion",
            "config",
            "skills",
            "log",
            "search",
            "telemetry",
            "uninstall",
            "update",
            "variables",
            "version",
            "website",
        ]);
        expect(catalog.globalOptions.map(option => option.longFlag)).toEqual([
            "--team",
            "--debug",
            "--lang",
        ]);
    });

    test("loads only the dispatched command for each command name and alias", async () => {
        const fullCatalog = await loadCliCatalog();

        for (const command of fullCatalog.commands) {
            if (command.name === "completion") {
                continue;
            }

            for (const token of [command.name, ...command.aliases ?? []]) {
                const catalog = await loadCliCatalog([token, "--help"]);

                expect(
                    catalog.commands,
                    `${token} should load only the ${command.name} command.`,
                ).toEqual([command]);
            }
        }
    });

    test("skips global options before the command name", async () => {
        expect(await loadCommandNames(["--team", "demo", "--lang", "zh", "--debug", "var", "list"]))
            .toEqual(["variables"]);
        expect(await loadCommandNames(["--team=demo", "--lang=zh", "upgrade"]))
            .toEqual(["update"]);
    });

    test("loads no command for a bare version flag", async () => {
        expect(await loadCommandNames(["--version"])).toEqual([]);
        expect(await loadCommandNames(["--lang", "zh", "-V"])).toEqual([]);
    });

    test("loads every command when the root command list may be shown", async () => {
        const allCommandNames = await loadCommandNames(undefined);

        for (const argv of [
            [],
            ["--debug"],
            ["--help"],
            ["-h", "skills"],
            ["--version", "--help"],
            ["help", "skills"],
            ["unknown-command"],
            ["completion", "zsh"],
            ["--", "skills"],
        ]) {
            expect(await loadCommandNames(argv), argv.join(" ")).toEqual(allCommandNames);
        }
    });
});

async function loadCommandNames(argv: readonly string[] | undefined): Promise<string[]> {
    const catalog = await loadCliCatalog(argv);

    return catalog.commands.map(command => command.name);
}
