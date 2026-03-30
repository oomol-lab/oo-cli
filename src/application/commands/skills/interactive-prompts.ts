import type {
    InteractiveInput,
    Writer,
} from "../../contracts/cli.ts";

import process from "node:process";
import { PassThrough, Writable } from "node:stream";

import { isCancel, MultiSelectPrompt } from "@clack/core";
import color from "picocolors";

const outputTextDecoder = new TextDecoder();
const inputTextDecoder = new TextDecoder();

const promptSymbols = {
    active: color.cyan("◆"),
    cancelled: color.red("■"),
    inactive: color.dim("◻"),
    line: color.cyan("│"),
    mutedLine: color.gray("│"),
    selected: color.green("◼"),
    submitted: color.green("◇"),
    tail: color.cyan("└"),
} as const;

export interface InteractivePromptContext {
    stdin: InteractiveInput;
    stdout: Writer;
}

export interface InteractiveSkillSelectItem {
    description: string;
    name: string;
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
    const promptOptions = options.items.map(item => ({
        hint: item.description,
        label: formatSkillOptionLabel(item, promptStreams.output.columns),
        value: item.name,
    }));

    try {
        const selectedValues = await withPatchedPromptOutput(
            promptStreams.output,
            async () => await new MultiSelectPrompt<MultiSelectOption>({
                cursorAt: promptOptions[0]?.value,
                input: promptStreams.input,
                options: promptOptions,
                output: promptStreams.output,
                render() {
                    return renderMultiSelectPrompt(this, options.prompt);
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
): string {
    const header = `${color.gray("│")}\n${readPromptStateSymbol(prompt.state)}  ${message}\n`;

    switch (prompt.state) {
        case "submit":
            return `${header}${color.gray("│")}  ${prompt.options
                .filter(({ value }) => prompt.value.includes(value))
                .map(option => formatRenderedOption(option, "submitted"))
                .join(color.dim(", ")) || color.dim("none")}`;
        case "cancel": {
            const selectedOptions = prompt.options
                .filter(({ value }) => prompt.value.includes(value))
                .map(option => formatRenderedOption(option, "cancelled"))
                .join(color.dim(", "));

            return `${header}${color.gray("│")}  ${selectedOptions.trim() === "" ? "" : `${selectedOptions}\n${color.gray("│")}`}`;
        }
        case "error": {
            const renderedError = prompt.error.split("\n").map((line, index) =>
                index === 0
                    ? `${color.yellow("└")}  ${color.yellow(line)}`
                    : `   ${line}`,
            ).join("\n");

            return `${header}${color.yellow("│")}  ${renderScrollableOptions(
                prompt.cursor,
                prompt.options,
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "active-selected"
                        : "active",
                ),
            ).join(`\n${color.yellow("│")}  `)}\n${renderedError}\n`;
        }
        default:
            return `${header}${promptSymbols.line}  ${renderScrollableOptions(
                prompt.cursor,
                prompt.options,
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "active-selected"
                        : "active",
                ),
                option => formatRenderedOption(
                    option,
                    isOptionSelected(prompt, option)
                        ? "selected"
                        : "inactive",
                ),
            ).join(`\n${promptSymbols.line}  `)}\n${promptSymbols.tail}\n`;
    }
}

function renderScrollableOptions(
    cursor: number,
    options: readonly MultiSelectOption[],
    activeStyle: (option: MultiSelectOption) => string,
    inactiveStyle: (option: MultiSelectOption) => string = option =>
        formatRenderedOption(option, "inactive"),
): string[] {
    const maxItems = Number.POSITIVE_INFINITY;
    const visibleRows = Math.max((process.stdout.rows ?? 24) - 4, 0);
    const windowSize = Math.min(
        visibleRows,
        Math.max(maxItems, 5),
    );
    let offset = 0;

    if (cursor >= offset + windowSize - 3) {
        offset = Math.max(
            Math.min(cursor - windowSize + 3, options.length - windowSize),
            0,
        );
    }
    else if (cursor < offset + 2) {
        offset = Math.max(cursor - 2, 0);
    }

    return options.slice(offset, offset + windowSize).map((option, index) =>
        index + offset === cursor ? activeStyle(option) : inactiveStyle(option),
    );
}

function formatRenderedOption(
    option: MultiSelectOption,
    state: "active" | "active-selected" | "cancelled" | "inactive" | "selected" | "submitted",
): string {
    switch (state) {
        case "active":
            return `${color.cyan("◻")} ${option.label} ${option.hint === "" ? "" : color.dim(`(${option.hint})`)}`;
        case "active-selected":
            return `${color.green("◼")} ${option.label} ${option.hint === "" ? "" : color.dim(`(${option.hint})`)}`;
        case "cancelled":
            return color.strikethrough(color.dim(option.label));
        case "inactive":
            return `${color.dim("◻")} ${color.dim(option.label)}`;
        case "selected":
            return `${color.green("◼")} ${color.dim(option.label)} ${option.hint === "" ? "" : color.dim(`(${option.hint})`)}`;
        case "submitted":
            return color.dim(option.label);
    }
}

function readPromptStateSymbol(state: string): string {
    switch (state) {
        case "cancel":
            return promptSymbols.cancelled;
        case "submit":
            return promptSymbols.submitted;
        default:
            return promptSymbols.active;
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
