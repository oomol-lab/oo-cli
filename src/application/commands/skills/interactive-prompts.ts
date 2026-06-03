import type {
    InteractiveInput,
    Writer,
} from "../../contracts/cli.ts";

const inputTextDecoder = new TextDecoder();

export interface InteractivePromptContext {
    stdin: InteractiveInput;
    stdout: Writer;
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

export async function requestInteractiveText(
    context: InteractivePromptContext,
    options: {
        prompt: string;
    },
): Promise<string> {
    context.stdout.write(options.prompt);

    return (await readPromptLine(context.stdin)).trim();
}

export async function selectInteractiveValue<Value extends string>(
    context: InteractivePromptContext,
    options: {
        invalidMessage: string;
        prompt: string;
        values: readonly Value[];
    },
): Promise<Value> {
    while (true) {
        context.stdout.write(options.prompt);
        const value = normalizePromptValue(await readPromptLine(context.stdin));

        if (isInteractiveValueOption(value, options.values)) {
            return value;
        }

        context.stdout.write(`${options.invalidMessage}\n`);
    }
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

function isInteractiveValueOption<Value extends string>(
    value: string,
    values: readonly Value[],
): value is Value {
    return values.includes(value as Value);
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
