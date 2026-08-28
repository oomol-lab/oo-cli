import { describe, expect, test } from "bun:test";

import { createCliCatalog } from "../../application/commands/catalog.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { StaticCompletionRenderer } from "./static-completion-renderer.ts";

describe("StaticCompletionRenderer", () => {
    test("renders bash completion with commands and options", () => {
        const { catalog, renderer } = createCompletionRendererFixture("en");
        const output = renderer.render("bash", catalog);

        expect(output).toContain("auth");
        expect(output).toContain("completion");
        expect(output).toContain("config");
        expect(output).toContain("connector");
        expect(output).toContain(`"|install")`);
        expect(output).toContain("login");
        expect(output).toContain("logout");
        expect(output).toContain("search");
        expect(output).toContain(`"|update")`);
        expect(output).toContain("--lang");
        expect(output).toContain("en zh");
    });

    test("renders zsh completion with the expected command hook", () => {
        const { catalog, renderer } = createCompletionRendererFixture("en");
        const output = renderer.render("zsh", catalog);

        expect(output).toContain(`#compdef ${APP_NAME}`);
        expect(output).toContain("auth switch");
        expect(output).toContain("config set");
        expect(output).toContain("connector run");
        expect(output).toContain(`"|install")`);
        expect(output).toContain("search");
        expect(output).toContain(`"|update")`);
        expect(output).toContain(`compdef _${APP_NAME} ${APP_NAME}`);
    });

    test("renders fish completion entries", () => {
        const { catalog, renderer } = createCompletionRendererFixture("zh");
        const output = renderer.render("fish", catalog);

        expect(output).toContain(`complete -c ${APP_NAME} -f`);
        expect(output).toContain("auth");
        expect(output).toContain("__fish_seen_subcommand_from auth");
        expect(output).toContain("completion");
        expect(output).toContain("config");
        expect(output).toContain("connector");
        expect(output).not.toContain(
            `complete -c ${APP_NAME} -n '__fish_use_subcommand' -a 'install'`,
        );
        expect(output).toContain("login");
        expect(output).toContain("logout");
        expect(output).toContain("__fish_seen_subcommand_from search");
        expect(output).toContain(
            `complete -c ${APP_NAME} -n '__fish_use_subcommand' -a 'update'`,
        );
        expect(output).toContain("en zh");
    });

    test("shows flow completion", () => {
        const { catalog, renderer } = createCompletionRendererFixture("en");
        const output = renderer.render("fish", catalog);
        const flowCompletion = `complete -c ${APP_NAME} -n '__fish_use_subcommand' -a 'flow'`;

        expect(output).toContain(flowCompletion);
    });

    test("renders dynamic team name completion for every shell", () => {
        const { catalog, renderer } = createCompletionRendererFixture("en");
        const bashOutput = renderer.render("bash", catalog);
        const zshOutput = renderer.render("zsh", catalog);
        const fishOutput = renderer.render("fish", catalog);

        expect(bashOutput).toContain(`"team use:0")`);
        expect(bashOutput).toContain(
            `"\${COMP_WORDS[0]}" __complete team-names -- "$cur"`,
        );
        expect(zshOutput).toContain(`"team use:0")`);
        expect(zshOutput).toContain(
            `"\${words[1]}" __complete team-names -- "$cur"`,
        );
        expect(fishOutput).toContain(
            "__fish_seen_subcommand_from team use; and __fish_is_nth_token 4",
        );
        expect(fishOutput).toContain(
            `command ${APP_NAME} __complete team-names -- (commandline -ct)`,
        );
    });
});

function createCompletionRendererFixture(locale: "en" | "zh") {
    return {
        catalog: createCliCatalog(),
        renderer: new StaticCompletionRenderer(createTranslator(locale)),
    };
}
