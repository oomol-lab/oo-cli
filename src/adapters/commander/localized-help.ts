import type { Argument, Command, Option } from "commander";
import type { Translator } from "../../application/contracts/translator.ts";

import { Help } from "commander";
import { APP_NAME } from "../../application/config/app-config.ts";
import { createTerminalColors } from "../../application/terminal-colors.ts";

const OOMOL_BRAND_NAME = "OOMOL";

export class LocalizedHelp extends Help {
    private colors = createTerminalColors(false);

    constructor(private readonly translator: Translator) {
        super();
        this.showGlobalOptions = true;
    }

    override prepareContext(contextOptions: {
        error?: boolean;
        helpWidth?: number;
        outputHasColors?: boolean;
    }): void {
        super.prepareContext(contextOptions);
        this.colors = createTerminalColors(Boolean(contextOptions.outputHasColors));
    }

    override styleTitle(title: string): string {
        switch (title) {
            case "Usage:":
                return this.translator.t("help.usage");
            case "Arguments:":
                return this.translator.t("help.arguments");
            case "Options:":
                return this.translator.t("help.options");
            case "Global Options:":
                return this.translator.t("help.globalOptions");
            case "Commands:":
                return this.translator.t("help.commands");
            default:
                return title;
        }
    }

    // Choices are the only extra info the CLI contract can express: an
    // argument definition carries `choices`, and an option definition carries
    // no default, preset, env var, or choices at all.
    override argumentDescription(argument: Argument): string {
        if (!argument.argChoices?.length) {
            return argument.description ?? "";
        }

        const choices = `(${this.translator.t("help.extra.choices")}: ${formatChoices(argument.argChoices)})`;

        return argument.description
            ? `${argument.description} ${choices}`
            : choices;
    }

    override subcommandTerm(cmd: Command): string {
        const term = super.subcommandTerm(cmd);
        const aliases = cmd.aliases();

        // Commander only renders the first alias (name|alias0). Expand the
        // term so every registered alias is discoverable in the command list.
        if (aliases.length <= 1) {
            return term;
        }

        const firstAliasPrefix = `${cmd.name()}|${aliases[0]}`;
        const allAliasesPrefix = `${cmd.name()}|${aliases.join("|")}`;

        return term.startsWith(firstAliasPrefix)
            ? `${allAliasesPrefix}${term.slice(firstAliasPrefix.length)}`
            : term;
    }

    override visibleGlobalOptions(cmd: Command): Option[] {
        if (!this.showGlobalOptions || cmd.parent === null) {
            return [];
        }

        const rootCommand = findRootCommand(cmd);

        return rootCommand.options.filter(option => !option.hidden);
    }

    override styleCommandDescription(description: string): string {
        const appDescription = this.translator.t("app.description");

        if (description !== appDescription) {
            return description;
        }

        return this.translator.t("help.appDescription.colored", {
            appName: this.colors.magenta(APP_NAME),
            companyName: this.colors.cyan(OOMOL_BRAND_NAME),
        });
    }

    override formatHelp(cmd: Command, helper: Help): string {
        const formattedHelp = super.formatHelp(cmd, helper);
        const sections = formattedHelp.split("\n\n");
        const usagePrefix = `${this.translator.t("help.usage")} `;

        if (!sections[0]?.startsWith(usagePrefix)) {
            return formattedHelp;
        }

        return sections.slice(1).join("\n\n");
    }
}

function findRootCommand(command: Command): Command {
    let current = command;

    while (current.parent !== null) {
        current = current.parent;
    }

    return current;
}

function formatChoices(choices: readonly string[]): string {
    return choices.map(choice => JSON.stringify(choice)).join(", ");
}
