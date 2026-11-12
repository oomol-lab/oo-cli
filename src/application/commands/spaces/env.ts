import type { CliCommandDefinition, InteractiveInput } from "../../contracts/cli.ts";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createSpacesClient, listEnvironmentNames, removeEnvironmentVariable, setEnvironmentVariable } from "./api.ts";
import { spaceArgument, spaceInput, teamOptions, yesOption } from "./shared.ts";

// Environment variables of the space's Convex deployment, read by its server
// functions. Values are write-only: they come from stdin and are never
// accepted as arguments or printed.

const maxNameLength = 256;
const maxValueBytes = 8_192;

function isAsciiLetter(character: string): boolean {
    return (character >= "a" && character <= "z") || (character >= "A" && character <= "Z");
}

// A letter followed by letters, digits or underscores.
function assertVariableName(name: string): void {
    const valid = name.length <= maxNameLength
        && isAsciiLetter(name.charAt(0))
        && [...name].every(character => isAsciiLetter(character) || (character >= "0" && character <= "9") || character === "_");

    if (!valid) {
        throw new CliUserError("errors.spaces.invalidEnvName", 2, { value: name });
    }
}

// Reads stdin to its end and returns it unchanged: an empty value, a trailing
// newline and a byte order mark are all part of the value.
async function readVariableValue(stdin: InteractiveInput): Promise<string> {
    if (stdin.isTTY === true) {
        throw new CliUserError("errors.spaces.stdinTty", 2);
    }

    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const encoder = new TextEncoder();
        const chunks: Uint8Array[] = [];
        let total = 0;

        function stop(): void {
            stdin.off("data", onData);
            stdin.off("end", onEnd);
        }

        function onData(chunk: string | Uint8Array): void {
            const part = typeof chunk === "string" ? encoder.encode(chunk) : chunk;

            total += part.byteLength;

            if (total > maxValueBytes) {
                stop();
                reject(new CliUserError("errors.spaces.envValueTooLarge", 2, { max: maxValueBytes }));
                return;
            }

            chunks.push(part);
        }

        function onEnd(): void {
            stop();
            resolve(Buffer.concat(chunks));
        }

        // Subscribe to `data` before `end` so buffered chunks flush first.
        stdin.on("data", onData);
        stdin.on("end", onEnd);
        stdin.resume?.();
    });

    try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        throw new CliUserError("errors.spaces.invalidEnvValue", 2);
    }
}

const list: CliCommandDefinition<z.infer<typeof spaceInput>> = {
    name: "list",
    summaryKey: "commands.spaces.env.list.summary",
    output: "standard",
    inputSchema: spaceInput,
    arguments: [spaceArgument],
    options: teamOptions,
    handler: async (input, context) => {
        const result = await listEnvironmentNames(await createSpacesClient(input, context), input.space);

        context.output.emit(result, () => context.stdout.write(result.names.length === 0
            ? `${context.translator.t("spaces.text.noEnvironmentVariables")}\n`
            : `${result.names.join("\n")}\n`));
    },
};

const nameArgument = { name: "name", descriptionKey: "arguments.spaces.envName", required: true };
const setInput = spaceInput.extend({ name: z.string(), stdin: z.boolean().optional() });
const set: CliCommandDefinition<z.infer<typeof setInput>> = {
    name: "set",
    summaryKey: "commands.spaces.env.set.summary",
    descriptionKey: "commands.spaces.env.set.description",
    output: "standard",
    inputSchema: setInput,
    arguments: [spaceArgument, nameArgument],
    options: [...teamOptions, { name: "stdin", longFlag: "--stdin", descriptionKey: "options.spaces.envStdin" }],
    handler: async (input, context) => {
        assertVariableName(input.name);

        if (input.stdin !== true) {
            throw new CliUserError("errors.spaces.stdinRequired", 2);
        }

        const value = await readVariableValue(context.stdin);
        const result = await setEnvironmentVariable(await createSpacesClient(input, context), input.space, input.name, value);

        context.output.emit(result, () => context.stdout.write(`${context.translator.t("spaces.text.envSet", result)}\n`));
    },
};

const removeInput = spaceInput.extend({ name: z.string(), yes: z.boolean().optional() });
const remove: CliCommandDefinition<z.infer<typeof removeInput>> = {
    name: "remove",
    summaryKey: "commands.spaces.env.remove.summary",
    output: "standard",
    inputSchema: removeInput,
    arguments: [spaceArgument, nameArgument],
    options: [...teamOptions, yesOption],
    handler: async (input, context) => {
        assertVariableName(input.name);

        if (input.yes !== true) {
            throw new CliUserError("errors.spaces.envRemoveNotConfirmed", 2, { name: input.name });
        }

        const result = await removeEnvironmentVariable(await createSpacesClient(input, context), input.space, input.name);

        context.output.emit(result, () => context.stdout.write(`${context.translator.t("spaces.text.envRemoved", result)}\n`));
    },
};

export const envCommand: CliCommandDefinition = {
    name: "env",
    summaryKey: "commands.spaces.env.summary",
    descriptionKey: "commands.spaces.env.description",
    children: [list, set, remove],
};
