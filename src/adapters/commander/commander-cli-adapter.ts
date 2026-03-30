import type { OptionValues } from "commander";
import type { ZodError, ZodType } from "zod";

import type { CliCatalog, CliCommandDefinition, CliExecutionContext } from "../../application/contracts/cli.ts";
import type { Translator } from "../../application/contracts/translator.ts";
import process from "node:process";
import {
    Argument,
    Command,
    CommanderError,
    Option,
} from "commander";
import {
    CliUserError,
} from "../../application/contracts/cli.ts";
import { LocalizedHelp } from "./localized-help.ts";

interface CommanderCliRunRequest {
    argv: readonly string[];
    catalog: CliCatalog;
    context: CliExecutionContext;
}

interface CommandOutputConfiguration {
    getErrHasColors: () => boolean;
    getErrHelpWidth: () => number;
    getOutHasColors: () => boolean;
    getOutHelpWidth: () => number;
    outputError: () => void;
    writeErr: (value: string) => void;
    writeOut: (value: string) => void;
}

class LocalizedCommand extends Command {
    constructor(
        private readonly translator: Translator,
        name?: string,
    ) {
        super(name);
    }

    override createCommand(name?: string): Command {
        return new LocalizedCommand(this.translator, name);
    }

    override createHelp(): LocalizedHelp {
        return new LocalizedHelp(this.translator);
    }
}

export class CommanderCliAdapter {
    async run(request: CommanderCliRunRequest): Promise<number> {
        try {
            const program = this.buildProgram(request.catalog, request.context);

            await program.parseAsync(request.argv, { from: "user" });
            return 0;
        }
        catch (error) {
            return this.handleError(error, request.context);
        }
    }

    private buildProgram(
        catalog: CliCatalog,
        context: CliExecutionContext,
    ): Command {
        const program = new LocalizedCommand(context.translator, catalog.name);

        program
            .name(catalog.name)
            .description(context.translator.t(catalog.descriptionKey))
            .version(
                context.versionText ?? context.version,
                "-V, --version",
                context.translator.t("options.version"),
            )
            .helpOption("-h, --help", context.translator.t("options.help"))
            .helpCommand(
                "help [command]",
                context.translator.t("commands.help.summary"),
            )
            .configureHelp({
                showGlobalOptions: true,
            })
            .configureOutput(createOutputConfiguration(context))
            .exitOverride();

        for (const option of catalog.globalOptions) {
            program.addOption(createOption(option, context.translator));
        }

        for (const command of catalog.commands) {
            this.addCommand(program, command, context);
        }

        return program;
    }

    private addCommand(
        parent: Command,
        definition: CliCommandDefinition,
        context: CliExecutionContext,
    ): void {
        const command = parent.command(definition.name);
        configureCommand(command, definition, context.translator);

        for (const child of definition.children ?? []) {
            this.addCommand(command, child, context);
        }

        const handler = definition.handler;

        if (!handler) {
            return;
        }

        const inputSchema = ensureCommandInputSchema(definition);

        bindCommandHandler(command, definition, inputSchema, context);
    }

    private handleError(
        error: unknown,
        context: CliExecutionContext,
    ): number {
        if (error instanceof CliUserError) {
            context.stderr.write(
                `${context.translator.t(error.key, error.params)}\n`,
            );

            return error.exitCode;
        }

        if (error instanceof CommanderError) {
            if (
                error.code === "commander.help"
                || error.code === "commander.helpDisplayed"
                || error.code === "commander.version"
            ) {
                return 0;
            }

            const localizedMessage = localizeCommanderError(
                error,
                context.translator,
            );

            context.stderr.write(`${localizedMessage}\n`);

            return 2;
        }

        context.stderr.write(
            `${context.translator.t("errors.unexpected", {
                message: toErrorMessage(error),
            })}\n`,
        );

        return 1;
    }
}

function createOutputConfiguration(
    context: CliExecutionContext,
): CommandOutputConfiguration {
    const defaultHelpWidth = 80;

    return {
        getErrHelpWidth: () =>
            context.stderr.isTTY ? process.stderr.columns : defaultHelpWidth,
        getOutHelpWidth: () =>
            context.stdout.isTTY ? process.stdout.columns : defaultHelpWidth,
        writeOut: (value: string) => context.stdout.write(value),
        writeErr: (value: string) => context.stderr.write(value),
        outputError: () => {},
        getOutHasColors: () => context.stdout.hasColors?.() ?? false,
        getErrHasColors: () => context.stderr.hasColors?.() ?? false,
    };
}

function configureCommand(
    command: Command,
    definition: CliCommandDefinition,
    translator: Translator,
): void {
    const descriptionKey = definition.descriptionKey ?? definition.summaryKey;

    command
        .summary(translator.t(definition.summaryKey))
        .description(translator.t(descriptionKey))
        .helpOption("-h, --help", translator.t("options.help"));

    for (const alias of definition.aliases ?? []) {
        command.alias(alias);
    }

    if (definition.children?.length) {
        command.helpCommand(
            "help [command]",
            translator.t("commands.help.summary"),
        );
    }

    for (const option of definition.options ?? []) {
        command.addOption(createOption(option, translator));
    }

    for (const argument of definition.arguments ?? []) {
        command.addArgument(
            createArgument(argument, translator),
        );
    }

    if (definition.missingArgumentBehavior === "showHelp") {
        configureMissingArgumentHelp(command);
    }
}

function bindCommandHandler<TInput>(
    command: Command,
    definition: CliCommandDefinition<TInput>,
    inputSchema: ZodType<TInput>,
    context: CliExecutionContext,
): void {
    const handler = definition.handler;

    if (!handler) {
        return;
    }

    command.action(async (...actionArguments) => {
        const commandInstance = actionArguments.at(-1) as Command;
        const rawInput = collectRawInput(
            definition,
            actionArguments,
            commandInstance.optsWithGlobals<OptionValues>(),
        );
        const parsedInput = parseInput(
            definition,
            inputSchema,
            rawInput,
        );

        await handler(parsedInput, context);
    });
}

function formatOptionFlags(option: {
    longFlag: string;
    shortFlag?: string;
    valueName?: string;
}): string {
    const longFlag = option.valueName
        ? `${option.longFlag} <${option.valueName}>`
        : option.longFlag;

    return option.shortFlag
        ? `${option.shortFlag}, ${longFlag}`
        : longFlag;
}

function createOption(
    option: {
        descriptionKey: string;
        implies?: Record<string, unknown>;
        longFlag: string;
        shortFlag?: string;
        valueName?: string;
    },
    translator: Translator,
): Option {
    const commanderOption = new Option(
        formatOptionFlags(option),
        translator.t(option.descriptionKey),
    );

    if (option.implies !== undefined) {
        commanderOption.implies(option.implies);
    }

    return commanderOption;
}

function formatArgumentSyntax(argument: {
    name: string;
    required?: boolean;
    variadic?: boolean;
}): string {
    const argumentName = argument.variadic === true
        ? `${argument.name}...`
        : argument.name;

    if (argument.required === false) {
        return `[${argumentName}]`;
    }

    return `<${argumentName}>`;
}

function createArgument(
    argument: {
        name: string;
        descriptionKey: string;
        required?: boolean;
        choices?: readonly string[];
        variadic?: boolean;
    },
    translator: Translator,
): Argument {
    const commanderArgument = new Argument(
        formatArgumentSyntax(argument),
        translator.t(argument.descriptionKey),
    );

    if (argument.choices?.length) {
        commanderArgument.argChoices = [...argument.choices];
    }

    return commanderArgument;
}

function configureMissingArgumentHelp(command: Command): void {
    const commandWithMissingArgument = command as Command & {
        missingArgument: (name: string) => never;
    };

    commandWithMissingArgument.missingArgument = function missingArgument(): never {
        this.outputHelp();
        throw new CommanderError(0, "commander.helpDisplayed", "");
    };
}

function collectRawInput<TInput>(
    definition: CliCommandDefinition<TInput>,
    actionArguments: unknown[],
    optionValues: OptionValues,
): Record<string, unknown> {
    const rawInput: Record<string, unknown> = {};
    const positionalArguments = actionArguments.slice(
        0,
        definition.arguments?.length ?? 0,
    );

    for (const [index, argument] of (definition.arguments ?? []).entries()) {
        rawInput[argument.name] = positionalArguments[index];
    }

    for (const option of definition.options ?? []) {
        rawInput[option.name] = optionValues[option.name];
    }

    return rawInput;
}

function parseInput<TInput>(
    definition: CliCommandDefinition<TInput>,
    inputSchema: ZodType<TInput>,
    rawInput: Record<string, unknown>,
): TInput {
    const result = inputSchema.safeParse(rawInput);

    if (result.success) {
        return result.data as TInput;
    }

    throw mapInputError(definition, result.error, rawInput);
}

function ensureCommandInputSchema<TInput>(
    definition: CliCommandDefinition<TInput>,
): ZodType<TInput> {
    if (!definition.inputSchema) {
        throw new Error(
            `Command "${definition.name}" must define inputSchema when handler is provided.`,
        );
    }

    return definition.inputSchema as ZodType<TInput>;
}

function mapInputError(
    definition: CliCommandDefinition<any>,
    error: ZodError,
    rawInput: Record<string, unknown>,
): CliUserError {
    return definition.mapInputError?.(error, rawInput)
        ?? new CliUserError("errors.unexpected", 1, {
            message: error.message,
        });
}

function localizeCommanderError(
    error: CommanderError,
    translator: Translator,
): string {
    const suggestion = extractSuggestion(error.message);

    let message = "";

    switch (error.code) {
        case "commander.unknownOption":
            message = translator.t("errors.commander.unknownOption", {
                value: extractQuotedValue(error.message) ?? "--unknown",
            });
            break;
        case "commander.unknownCommand":
            message = translator.t("errors.commander.unknownCommand", {
                value: extractQuotedValue(error.message) ?? "unknown",
            });
            break;
        case "commander.missingArgument":
            message = translator.t("errors.commander.missingArgument", {
                value: extractQuotedValue(error.message) ?? "argument",
            });
            break;
        case "commander.optionMissingArgument":
            message = translator.t("errors.commander.optionMissingArgument", {
                value: extractQuotedValue(error.message) ?? "--option",
            });
            break;
        case "commander.missingMandatoryOptionValue":
            message = translator.t("errors.commander.missingMandatoryOptionValue", {
                value: extractQuotedValue(error.message) ?? "--option",
            });
            break;
        case "commander.invalidArgument":
            message = translator.t("errors.commander.invalidArgument", {
                value: stripErrorPrefix(firstLine(error.message)),
            });
            break;
        case "commander.excessArguments":
            message = translator.t("errors.commander.excessArguments");
            break;
        default:
            message = stripErrorPrefix(firstLine(error.message));
            break;
    }

    if (!suggestion) {
        return message;
    }

    return `${message}\n${translator.t("errors.commander.suggestion", {
        value: suggestion,
    })}`;
}

function extractQuotedValue(message: string): string | undefined {
    const firstQuoteIndex = message.indexOf("'");

    if (firstQuoteIndex === -1) {
        return undefined;
    }

    const secondQuoteIndex = message.indexOf("'", firstQuoteIndex + 1);

    if (secondQuoteIndex === -1) {
        return undefined;
    }

    return message.slice(firstQuoteIndex + 1, secondQuoteIndex);
}

function extractSuggestion(message: string): string | undefined {
    const prefix = "(Did you mean ";
    const startIndex = message.indexOf(prefix);

    if (startIndex === -1) {
        return undefined;
    }

    const endIndex = message.indexOf("?)", startIndex);

    if (endIndex === -1) {
        return undefined;
    }

    return message.slice(startIndex + prefix.length, endIndex);
}

function firstLine(message: string): string {
    const lineBreakIndex = message.indexOf("\n");

    if (lineBreakIndex === -1) {
        return message;
    }

    return message.slice(0, lineBreakIndex);
}

function stripErrorPrefix(message: string): string {
    const prefix = "error: ";

    if (message.startsWith(prefix)) {
        return message.slice(prefix.length);
    }

    return message;
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
