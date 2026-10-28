import type { CliCatalog, CliCommandDefinition } from "../contracts/cli.ts";

import { APP_NAME } from "../config/app-config.ts";
import { teamOption } from "./team/identity.ts";

interface CliCommandLoader {
    name: string;
    aliases?: readonly string[];
    // Commands that render the whole command tree, such as shell completion
    // scripts, need every command definition loaded.
    requiresFullCatalog?: boolean;
    load: () => Promise<CliCommandDefinition<any>>;
}

const globalOptions = [
    { ...teamOption("options.team"), global: true },
    {
        name: "debug",
        longFlag: "--debug",
        descriptionKey: "options.debug",
        global: true,
    },
    {
        name: "lang",
        longFlag: "--lang",
        valueName: "lang",
        descriptionKey: "options.lang",
        global: true,
    },
] as const;

const globalValueOptionFlags: readonly string[] = globalOptions
    .filter(option => "valueName" in option && option.valueName !== undefined)
    .map(option => option.longFlag);

// Command modules are imported on demand so a single invocation only
// evaluates the command tree it dispatches to instead of every command (and
// their dependencies) on each startup. The array order is the registration
// order shown in help output.
const commandLoaders: readonly CliCommandLoader[] = [
    { name: "auth", load: async () => (await import("./auth/index.ts")).authCommand },
    { name: "check-update", load: async () => (await import("./check-update.ts")).checkUpdateCommand },
    { name: "connector", load: async () => (await import("./connector/index.ts")).connectorCommand },
    { name: "file", load: async () => (await import("./file/index.ts")).fileCommand },
    { name: "flow", load: async () => (await import("./flow.ts")).flowCommand },
    { name: "info", load: async () => (await import("./info.ts")).infoCommand },
    { name: "install", load: async () => (await import("./install.ts")).installCommand },
    { name: "__complete", load: async () => (await import("./internal-completion.ts")).internalCompletionCommand },
    { name: "llm", load: async () => (await import("./llm/index.ts")).llmCommand },
    { name: "login", load: async () => (await import("./login.ts")).loginCommand },
    { name: "logout", load: async () => (await import("./logout.ts")).logoutCommand },
    { name: "team", load: async () => (await import("./team/index.ts")).teamCommand },
    {
        name: "completion",
        requiresFullCatalog: true,
        load: async () => (await import("./completion.ts")).completionCommand,
    },
    { name: "config", load: async () => (await import("./config/index.ts")).configCommand },
    { name: "skills", load: async () => (await import("./skills/index.ts")).skillsCommand },
    { name: "log", load: async () => (await import("./log/index.ts")).logCommand },
    { name: "search", load: async () => (await import("./search.ts")).searchCommand },
    { name: "telemetry", load: async () => (await import("./telemetry/index.ts")).telemetryCommand },
    { name: "uninstall", load: async () => (await import("./uninstall.ts")).uninstallCommand },
    {
        name: "update",
        aliases: ["upgrade"],
        load: async () => (await import("./update.ts")).updateCommand,
    },
    {
        name: "variables",
        aliases: ["variable", "var", "vars"],
        load: async () => (await import("./variables/index.ts")).variablesCommand,
    },
    { name: "version", load: async () => (await import("./version.ts")).versionCommand },
    { name: "website", load: async () => (await import("./website/index.ts")).websiteCommand },
];

/**
 * Loads the command catalog. With `argv`, only the commands that invocation
 * can reach are loaded; without it, every command is loaded.
 */
export async function loadCliCatalog(argv?: readonly string[]): Promise<CliCatalog> {
    const loaders = argv === undefined
        ? commandLoaders
        : selectCommandLoaders(argv);

    return {
        name: APP_NAME,
        descriptionKey: "app.description",
        globalOptions,
        commands: await Promise.all(loaders.map(loader => loader.load())),
    };
}

// Anything that may render or search the root command list (root help,
// `help`, an unknown command, shell completion scripts) needs the full
// catalog; a dispatch to a known command needs only that command; a bare
// version flag needs none.
function selectCommandLoaders(argv: readonly string[]): readonly CliCommandLoader[] {
    let hasVersionFlag = false;

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]!;

        if (argument === "--" || argument === "-h" || argument === "--help") {
            return commandLoaders;
        }

        if (argument === "-V" || argument === "--version") {
            hasVersionFlag = true;
            continue;
        }

        if (argument.startsWith("-")) {
            if (globalValueOptionFlags.includes(argument)) {
                index += 1;
            }

            continue;
        }

        const loader = commandLoaders.find(candidate =>
            candidate.name === argument
            || candidate.aliases?.includes(argument) === true,
        );

        if (loader === undefined || loader.requiresFullCatalog === true) {
            return commandLoaders;
        }

        return [loader];
    }

    return hasVersionFlag ? [] : commandLoaders;
}
