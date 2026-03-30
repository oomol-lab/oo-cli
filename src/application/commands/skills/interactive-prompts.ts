import type {
    InteractiveInput,
    Writer,
} from "../../contracts/cli.ts";

import type { TerminalColors } from "../../terminal-colors.ts";
import process from "node:process";

import { PassThrough, Writable } from "node:stream";
import { isCancel, MultiSelectPrompt } from "@clack/core";
import {
    measureDisplayWidth,
    truncateDisplayWidth,
} from "../../display-width.ts";
import { createWriterColors } from "../../terminal-colors.ts";

const outputTextDecoder = new TextDecoder();
const inputTextDecoder = new TextDecoder();

export interface InteractivePromptContext {
    stdin: InteractiveInput;
    stdout: Writer;
}

export interface InteractiveSkillSelectItem {
    description: string;
    name: string;
    selected?: boolean;
    statusLabel?: string;
    title: string;
}

interface MultiSelectOption {
    hint: string;
    label: string;
    value: string;
}

export async function confirmInteractiveValue(
    context: InteractivePromptContext,
    options: {
        defaultValue?: boolean;
        invalidMessage: string;
        prompt: string;
    },
): Promise<boolean> {
    const defaultValue = options.defaultValue ?? false;

    while (true) {
        context.stdout.write(options.prompt);
        const value = normalizePromptValue(await readPromptLine(context.stdin));

        if (value === "") {
            return defaultValue;
        }

        if (value === "y" || value === "yes") {
            return true;
        }

        if (value === "n" || value === "no") {
            return false;
        }

        context.stdout.write(`${options.invalidMessage}\n`);
    }
}

export async function selectInteractiveSkills(
    context: InteractivePromptContext,
    options: {
        items: readonly InteractiveSkillSelectItem[];
        prompt: string;
    },
): Promise<string[]> {
    const promptStreams = createPromptStreams(context);
    const colors = createWriterColors(context.stdout);
    const initialValues = options.items
        .filter(item => item.selected === true)
        .map(item => item.name);
    const promptOptions = options.items.map((item) => {
        const label = formatSkillOptionLabel(item, promptStreams.output.columns);

        return {
            hint: formatSkillOptionHint(
                item.description,
                label,
                promptStreams.output.columns,
            ),
            label,
            value: item.name,
        };
    });

    try {
        const selectedValues = await withPatchedPromptOutput(
            promptStreams.output,
            async () => await new MultiSelectPrompt<MultiSelectOption>({
                cursorAt: promptOptions[0]?.value,
                initialValues,
                input: promptStreams.input,
                options: promptOptions,
                output: promptStreams.output,
                render() {
                    return renderMultiSelectPrompt(
                        this,
                        options.prompt,
                        colors,
                    );
                },
                required: false,
            }).prompt() as string[] | symbol,
        );

        if (isCancel(selectedValues)) {
            return [];
        }

        return selectedValues;
    }
    finally {
        promptStreams.input.dispose();
    }
}

async function withPatchedPromptOutput<T>(
    output: PromptOutputAdapter,
    action: () => Promise<T>,
): Promise<T> {
    const originalStdout = process.stdout;

    Object.defineProperty(process, "stdout", {
        configurable: true,
        value: output,
    });

    try {
        return await action();
    }
    finally {
        Object.defineProperty(process, "stdout", {
            configurable: true,
            value: originalStdout,
        });
    }
}

function createPromptStreams(
    context: InteractivePromptContext,
): {
    input: PromptInputAdapter;
    output: PromptOutputAdapter;
} {
    return {
        input: new PromptInputAdapter(context.stdin),
        output: new PromptOutputAdapter(context.stdout, process.stdout),
    };
}

function renderMultiSelectPrompt(
    prompt: Omit<MultiSelectPrompt<MultiSelectOption>, "prompt">,
    message: string,
    colors: TerminalColors,
): string {
    const header = `${formatPromptHeader(prompt.state, message, colors)}\n`;
    const itemIndent = "\u200B ";

    switch (prompt.state) {
        case "submit": {
            const formatOption = (option: MultiSelectOption) => formatRenderedOption(
                option,
                isOptionSelected(prompt, option)
                    ? "selected"
                    : "inactive",
                colors,
            );

            return `${header}${itemIndent}${renderScrollableOptions(
                prompt.cursor,
                prompt.options,
                formatOption,
                formatOption,
            ).join(`\n${itemIndent}`)}\n`;
        }
        case "cancel": {
            const selectedOptions = prompt.options
                .filter(({ value }) => prompt.value.includes(value))
                .map(option => formatRenderedOption(option, "cancelled", colors))
                .join(colors.dim(", "));

            return `${header}${selectedOptions.trim() === "" ? "" : `${itemIndent}${selectedOptions}\n`}`;
        }
        case "error": {
            const renderedError = prompt.error.split("\n").map((line, index) =>
                index === 0
                    ? `${itemIndent}${colors.yellow("└")}  ${colors.yellow(line)}`
                    : `   ${line}`,
            ).join("\n");

            return `${header}${itemIndent}${renderScrollableOptions(
                prompt.cursor,
                prompt.options,
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "active-selected"
                        : "active",
                    colors,
                ),
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "selected"
                        : "inactive",
                    colors,
                ),
            ).join(`\n${itemIndent}`)}\n${renderedError}\n`;
        }
        default:
            return `${header}${itemIndent}${renderScrollableOptions(
                prompt.cursor,
                prompt.options,
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "active-selected"
                        : "active",
                    colors,
                ),
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "selected"
                        : "inactive",
                    colors,
                ),
            ).join(`\n${itemIndent}`)}\n`;
    }
}

function formatPromptHeader(
    state: MultiSelectPrompt<MultiSelectOption>["state"],
    message: string,
    colors: TerminalColors,
): string {
    switch (state) {
        case "submit":
            return `${colors.green("◆")} ${message}`;
        case "cancel":
            return `${colors.dim("◇")} ${colors.dim(message)}`;
        default:
            return `${colors.green("◇")} ${message}`;
    }
}

function renderScrollableOptions(
    cursor: number,
    options: readonly MultiSelectOption[],
    activeStyle: (option: MultiSelectOption) => string,
    inactiveStyle: (option: MultiSelectOption) => string,
): string[] {
    const visibleRows = Math.max((process.stdout.rows ?? 24) - 4, 0);
    let offset = 0;

    if (cursor >= offset + visibleRows - 3) {
        offset = Math.max(
            Math.min(cursor - visibleRows + 3, options.length - visibleRows),
            0,
        );
    }
    else if (cursor < offset + 2) {
        offset = Math.max(cursor - 2, 0);
    }

    return options.slice(offset, offset + visibleRows).map((option, index) =>
        index + offset === cursor ? activeStyle(option) : inactiveStyle(option),
    );
}

function formatRenderedOption(
    option: MultiSelectOption,
    state: "active" | "active-selected" | "cancelled" | "inactive" | "selected",
    colors: TerminalColors,
): string {
    switch (state) {
        case "active":
            return `${colors.cyan("◻")} ${option.label} ${option.hint === "" ? "" : colors.dim(`(${option.hint})`)}`;
        case "active-selected":
            return `${colors.green("◼")} ${option.label} ${option.hint === "" ? "" : colors.dim(`(${option.hint})`)}`;
        case "cancelled":
            return colors.strikethrough(colors.dim(option.label));
        case "inactive":
            return `${colors.dim("◻")} ${colors.dim(option.label)}`;
        case "selected":
            return `${colors.green("◼")} ${colors.dim(option.label)} ${option.hint === "" ? "" : colors.dim(`(${option.hint})`)}`;
    }
}

function isOptionSelected(
    prompt: Pick<MultiSelectPrompt<MultiSelectOption>, "value">,
    option: MultiSelectOption,
): boolean {
    return prompt.value.includes(option.value);
}

function formatSkillOptionLabel(
    item: InteractiveSkillSelectItem,
    terminalColumns: number,
): string {
    if (!item.statusLabel) {
        return item.name;
    }

    const minimumSpacing = 2;
    const reservedWidth = item.statusLabel.length + minimumSpacing;
    const safeColumns = terminalColumns > 0 ? terminalColumns : 80;
    const maxNameWidth = Math.max(
        safeColumns - reservedWidth - 12,
        item.name.length,
    );
    const displayName = item.name.length > maxNameWidth
        ? item.name.slice(0, maxNameWidth)
        : item.name;
    const paddingWidth = Math.max(
        safeColumns - displayName.length - reservedWidth - 12,
        minimumSpacing,
    );

    return `${displayName}${" ".repeat(paddingWidth)}${item.statusLabel}`;
}

function formatSkillOptionHint(
    hint: string,
    label: string,
    terminalColumns: number,
): string {
    if (hint === "") {
        return "";
    }

    const safeColumns = terminalColumns > 0 ? terminalColumns : 80;
    const reservedWidth = measureDisplayWidth(label) + 8;
    const availableWidth = safeColumns - reservedWidth;

    if (availableWidth <= 0) {
        return "";
    }

    return truncateDisplayWidth(hint, availableWidth);
}

async function readPromptLine(stdin: InteractiveInput): Promise<string> {
    return await new Promise((resolve) => {
        let bufferedValue = "";

        const onData = (chunk: string | Uint8Array) => {
            bufferedValue += typeof chunk === "string"
                ? chunk
                : inputTextDecoder.decode(chunk, { stream: true });

            const lineBreakIndex = resolveLineBreakIndex(bufferedValue);

            if (lineBreakIndex === -1) {
                return;
            }

            stdin.off("data", onData);
            stdin.pause?.();

            resolve(stripTrailingCarriageReturn(bufferedValue.slice(0, lineBreakIndex)));
        };

        stdin.resume?.();
        stdin.on("data", onData);
    });
}

function normalizePromptValue(value: string): string {
    return value.trim().toLowerCase();
}

function resolveLineBreakIndex(value: string): number {
    const lineFeedIndex = value.indexOf("\n");

    if (lineFeedIndex !== -1) {
        return lineFeedIndex;
    }

    return value.indexOf("\r");
}

function stripTrailingCarriageReturn(value: string): string {
    return value.endsWith("\r") ? value.slice(0, -1) : value;
}

class PromptInputAdapter extends PassThrough {
    readonly isTTY: boolean;

    constructor(
        private readonly input: InteractiveInput,
    ) {
        super();
        this.isTTY = input.isTTY === true;
        this.input.on("data", this.handleData);
    }

    override pause(): this {
        super.pause();
        this.input.pause?.();

        return this;
    }

    override resume(): this {
        super.resume();
        this.input.resume?.();

        return this;
    }

    setRawMode(value: boolean): void {
        this.input.setRawMode?.(value);
    }

    dispose(): void {
        this.input.off("data", this.handleData);
        this.end();
    }

    private readonly handleData = (chunk: string | Uint8Array) => {
        this.write(chunk);
    };
}

class PromptOutputAdapter extends Writable {
    readonly columns: number;
    readonly isTTY: boolean;
    readonly rows: number;

    constructor(
        private readonly writer: Writer,
        output: NodeJS.WriteStream,
    ) {
        super();
        this.columns = output.columns ?? 80;
        this.isTTY = writer.isTTY === true;
        this.rows = output.rows ?? 24;
    }

    override _write(
        chunk: Uint8Array,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        this.writer.write(outputTextDecoder.decode(chunk, { stream: true }));
        callback();
    }
}
