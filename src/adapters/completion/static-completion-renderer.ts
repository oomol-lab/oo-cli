import type {
    CliCatalog,
    CliCommandDefinition,
    CompletionRenderer,
    SupportedShell,
} from "../../application/contracts/cli.ts";
import type { Translator } from "../../application/contracts/translator.ts";

interface CompletionNode {
    readonly path: readonly string[];
    readonly pathKey: string;
    readonly childCommands: ReadonlyArray<{
        name: string;
        summary: string;
    }>;
    readonly visibleSubcommands: ReadonlyArray<{
        name: string;
        summary: string;
    }>;
    readonly options: readonly string[];
    readonly argumentChoices: readonly (readonly string[])[];
}

export class StaticCompletionRenderer implements CompletionRenderer {
    constructor(private readonly translator: Translator) {}

    render(shell: SupportedShell, catalog: CliCatalog): string {
        const nodes = buildCompletionNodes(catalog, this.translator);

        switch (shell) {
            case "bash":
                return renderBashCompletion(catalog.name, nodes);
            case "zsh":
                return renderZshCompletion(catalog.name, nodes);
            case "fish":
                return renderFishCompletion(catalog.name, nodes, this.translator);
        }
    }
}

function buildCompletionNodes(
    catalog: CliCatalog,
    translator: Translator,
): readonly CompletionNode[] {
    const globalOptions = flattenOptionFlags(catalog.globalOptions);
    const nodes: CompletionNode[] = [];

    const visit = (
        path: readonly string[],
        commands: readonly CliCommandDefinition[],
        argumentChoices: readonly (readonly string[])[] = [],
    ): void => {
        const pathKey = path.join(" ");
        const childCommands = commands.map(command => ({
            name: command.name,
            summary: translator.t(command.summaryKey),
        }));
        const visibleSubcommands = childCommands.length > 0
            ? [
                    ...childCommands,
                    {
                        name: "help",
                        summary: translator.t("commands.help.summary"),
                    },
                ]
            : childCommands;

        nodes.push({
            path,
            pathKey,
            childCommands,
            visibleSubcommands,
            options: [
                ...globalOptions,
                "-h",
                "--help",
                ...(path.length === 0 ? ["-V", "--version"] : []),
            ],
            argumentChoices,
        });

        for (const command of commands) {
            visit(
                [...path, command.name],
                command.children ?? [],
                (command.arguments ?? []).map(argument => argument.choices ?? []),
            );
        }
    };

    visit([], catalog.commands);

    return nodes;
}

function flattenOptionFlags(
    options: readonly {
        longFlag: string;
        shortFlag?: string;
    }[],
): string[] {
    return options.flatMap(option =>
        option.shortFlag
            ? [option.shortFlag, option.longFlag]
            : [option.longFlag],
    );
}

function renderBashCompletion(
    commandName: string,
    nodes: readonly CompletionNode[],
): string {
    return `#!/usr/bin/env bash
_${commandName}_completion() {
    local cur prev token path_key index arg_index skip_next
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev=""

    if (( COMP_CWORD > 0 )); then
        prev="\${COMP_WORDS[COMP_CWORD - 1]}"
    fi

    if [[ "$prev" == "--lang" ]]; then
        COMPREPLY=( $(compgen -W "en zh" -- "$cur") )
        return
    fi

    path_key=""
    index=1

    while (( index < COMP_CWORD )); do
        token="\${COMP_WORDS[index]}"

        if [[ "$token" == "--lang" ]]; then
            (( index += 2 ))
            continue
        fi

        if [[ "$token" == -* ]]; then
            (( index += 1 ))
            continue
        fi

        case "$path_key|$token" in
${buildTransitionCases(nodes)}
        esac

        break
    done

    arg_index=0
    skip_next=0

    while (( index < COMP_CWORD )); do
        token="\${COMP_WORDS[index]}"

        if (( skip_next == 1 )); then
            skip_next=0
            (( index += 1 ))
            continue
        fi

        if [[ "$token" == "--lang" ]]; then
            skip_next=1
            (( index += 1 ))
            continue
        fi

        if [[ "$token" == -* ]]; then
            (( index += 1 ))
            continue
        fi

        (( arg_index += 1 ))
        (( index += 1 ))
    done

    case "$path_key:$arg_index" in
${buildArgumentCases(nodes, "bash")}
    esac

    case "$path_key" in
${buildSuggestionCases(nodes, "bash")}
    esac
}

complete -F _${commandName}_completion ${commandName}
`;
}

function renderZshCompletion(
    commandName: string,
    nodes: readonly CompletionNode[],
): string {
    return `#compdef ${commandName}
_${commandName}() {
    local cur prev token path_key index arg_index skip_next
    cur="$words[CURRENT]"
    prev=""

    if (( CURRENT > 1 )); then
        prev="$words[CURRENT - 1]"
    fi

    if [[ "$prev" == "--lang" ]]; then
        compadd en zh
        return
    fi

    path_key=""
    index=2

    while (( index < CURRENT )); do
        token="$words[index]"

        if [[ "$token" == "--lang" ]]; then
            (( index += 2 ))
            continue
        fi

        if [[ "$token" == -* ]]; then
            (( index += 1 ))
            continue
        fi

        case "$path_key|$token" in
${buildTransitionCases(nodes)}
        esac

        break
    done

    arg_index=0
    skip_next=0

    while (( index < CURRENT )); do
        token="$words[index]"

        if (( skip_next == 1 )); then
            skip_next=0
            (( index += 1 ))
            continue
        fi

        if [[ "$token" == "--lang" ]]; then
            skip_next=1
            (( index += 1 ))
            continue
        fi

        if [[ "$token" == -* ]]; then
            (( index += 1 ))
            continue
        fi

        (( arg_index += 1 ))
        (( index += 1 ))
    done

    case "$path_key:$arg_index" in
${buildArgumentCases(nodes, "zsh")}
    esac

    case "$path_key" in
${buildSuggestionCases(nodes, "zsh")}
    esac
}

compdef _${commandName} ${commandName}
`;
}

function renderFishCompletion(
    commandName: string,
    nodes: readonly CompletionNode[],
    translator: Translator,
): string {
    const lines = [
        `complete -c ${commandName} -f`,
        `complete -c ${commandName} -l lang -d '${escapeSingleQuotes(
            translator.t("options.lang"),
        )}' -a 'en zh'`,
    ];
    const rootNode = nodes.find(node => node.path.length === 0);

    for (const command of rootNode?.visibleSubcommands ?? []) {
        lines.push(
            `complete -c ${commandName} -n '__fish_use_subcommand' -a '${command.name}' -d '${escapeSingleQuotes(command.summary)}'`,
        );
    }

    const completionNode = nodes.find(node => node.pathKey === "completion");

    if (completionNode?.argumentChoices[0]?.length) {
        lines.push(
            `complete -c ${commandName} -n '__fish_seen_subcommand_from completion' -a '${completionNode.argumentChoices[0].join(" ")}' -d '${escapeSingleQuotes(
                translator.t("arguments.shell"),
            )}'`,
        );
    }

    for (const node of nodes.filter(node => node.path.length > 0 && node.childCommands.length > 0)) {
        const seenCommands = node.path.join(" ");
        const excludedCommands = node.visibleSubcommands
            .map(command => command.name)
            .join(" ");

        for (const command of node.visibleSubcommands) {
            lines.push(
                `complete -c ${commandName} -n '__fish_seen_subcommand_from ${seenCommands}; and not __fish_seen_subcommand_from ${excludedCommands}' -a '${command.name}' -d '${escapeSingleQuotes(command.summary)}'`,
            );
        }
    }

    const configGetNode = nodes.find(node => node.pathKey === "config get");
    const configSetNode = nodes.find(node => node.pathKey === "config set");
    const configUnsetNode = nodes.find(node => node.pathKey === "config unset");

    if (configGetNode?.argumentChoices[0]?.length) {
        lines.push(
            `complete -c ${commandName} -n '__fish_seen_subcommand_from config get' -a '${configGetNode.argumentChoices[0].join(" ")}' -d '${escapeSingleQuotes(
                translator.t("arguments.key"),
            )}'`,
        );
    }

    if (configUnsetNode?.argumentChoices[0]?.length) {
        lines.push(
            `complete -c ${commandName} -n '__fish_seen_subcommand_from config unset' -a '${configUnsetNode.argumentChoices[0].join(" ")}' -d '${escapeSingleQuotes(
                translator.t("arguments.key"),
            )}'`,
        );
    }

    if (configSetNode?.argumentChoices[0]?.length) {
        lines.push(
            `complete -c ${commandName} -n '__fish_seen_subcommand_from config set; and __fish_is_nth_token 4' -a '${configSetNode.argumentChoices[0].join(" ")}' -d '${escapeSingleQuotes(
                translator.t("arguments.key"),
            )}'`,
        );
    }

    if (configSetNode?.argumentChoices[1]?.length) {
        lines.push(
            `complete -c ${commandName} -n '__fish_seen_subcommand_from config set; and __fish_is_nth_token 5' -a '${configSetNode.argumentChoices[1].join(" ")}' -d '${escapeSingleQuotes(
                translator.t("arguments.value"),
            )}'`,
        );
    }

    return `${lines.join("\n")}\n`;
}

function buildTransitionCases(
    nodes: readonly CompletionNode[],
): string {
    const lines: string[] = [];

    for (const node of nodes) {
        for (const command of node.childCommands) {
            const nextPath = [...node.path, command.name].join(" ");
            lines.push(
                `            "${node.pathKey}|${command.name}")`,
                `                path_key="${nextPath}"`,
                "                (( index += 1 ))",
                "                continue",
                "                ;;",
            );
        }
    }

    return lines.join("\n");
}

function buildArgumentCases(
    nodes: readonly CompletionNode[],
    shell: "bash" | "zsh",
): string {
    const lines: string[] = [];

    for (const node of nodes) {
        for (const [index, choices] of node.argumentChoices.entries()) {
            if (choices.length === 0) {
                continue;
            }

            if (shell === "bash") {
                lines.push(
                    `        "${node.pathKey}:${index}")`,
                    `            COMPREPLY=( $(compgen -W "${choices.join(" ")}" -- "$cur") )`,
                    "            return",
                    "            ;;",
                );
                continue;
            }

            lines.push(
                `        "${node.pathKey}:${index}")`,
                `            compadd ${choices.map(choice => `'${choice}'`).join(" ")}`,
                "            return",
                "            ;;",
            );
        }
    }

    return lines.join("\n");
}

function buildSuggestionCases(
    nodes: readonly CompletionNode[],
    shell: "bash" | "zsh",
): string {
    const lines: string[] = [];

    for (const node of nodes) {
        const suggestions = [
            ...node.visibleSubcommands.map(command => command.name),
            ...node.options,
        ];

        if (shell === "bash") {
            lines.push(
                `        "${node.pathKey}")`,
                `            COMPREPLY=( $(compgen -W "${suggestions.join(" ")}" -- "$cur") )`,
                "            return",
                "            ;;",
            );
            continue;
        }

        lines.push(
            `        "${node.pathKey}")`,
            `            compadd ${suggestions.map(choice => `'${choice}'`).join(" ")}`,
            "            return",
            "            ;;",
        );
    }

    return lines.join("\n");
}

function escapeSingleQuotes(value: string): string {
    return value.replaceAll("'", "\\'");
}
