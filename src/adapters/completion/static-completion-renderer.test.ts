import { describe, expect, test } from "bun:test";

import { createCliCatalog } from "../../application/commands/catalog.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { StaticCompletionRenderer } from "./static-completion-renderer.ts";

describe("StaticCompletionRenderer", () => {
    test("renders bash completion with commands and options", () => {
        const renderer = new StaticCompletionRenderer(createTranslator("en"));
        const output = renderer.render("bash", createCliCatalog());

        expect(output).toContain("auth");
        expect(output).toContain("completion");
        expect(output).toContain("config");
        expect(output).toContain("login");
        expect(output).toContain("logout");
        expect(output).toContain("packages");
        expect(output).toContain("--lang");
        expect(output).toContain("en zh");
    });

    test("renders zsh completion with the expected command hook", () => {
        const renderer = new StaticCompletionRenderer(createTranslator("en"));
        const output = renderer.render("zsh", createCliCatalog());

        expect(output).toContain(`#compdef ${APP_NAME}`);
        expect(output).toContain("auth switch");
        expect(output).toContain("config set");
        expect(output).toContain("packages search");
        expect(output).toContain(`compdef _${APP_NAME} ${APP_NAME}`);
    });

    test("renders fish completion entries", () => {
        const renderer = new StaticCompletionRenderer(createTranslator("zh"));
        const output = renderer.render("fish", createCliCatalog());

        expect(output).toContain(`complete -c ${APP_NAME} -f`);
        expect(output).toContain("auth");
        expect(output).toContain("__fish_seen_subcommand_from auth");
        expect(output).toContain("completion");
        expect(output).toContain("config");
        expect(output).toContain("login");
        expect(output).toContain("logout");
        expect(output).toContain("__fish_seen_subcommand_from packages");
        expect(output).toContain("en zh");
    });
});
