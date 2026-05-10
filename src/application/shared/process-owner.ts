import { basename } from "node:path";
import process from "node:process";

import { isProcessMissingError } from "./fs-errors.ts";

export function isProcessLockOwnerActive(
    pid: number,
    execPath: string,
    platform: NodeJS.Platform,
): boolean {
    if (!isProcessAlive(pid)) {
        return false;
    }

    const commandLine = readProcessCommandLine(pid, platform);

    if (commandLine === null) {
        // When the command line cannot be verified, keep the lock conservative.
        return true;
    }

    return commandLineReferencesExecutable(commandLine, execPath);
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return !isProcessMissingError(error);
    }
}

function readProcessCommandLine(
    pid: number,
    platform: NodeJS.Platform,
): string | null {
    if (platform === "win32") {
        return null;
    }

    try {
        const result = Bun.spawnSync(
            [
                "ps",
                "-p",
                String(pid),
                "-o",
                "command=",
            ],
            {
                stderr: "pipe",
                stdin: "ignore",
                stdout: "pipe",
            },
        );

        if (result.exitCode !== 0) {
            return null;
        }

        const commandLine = new TextDecoder().decode(result.stdout).trim();

        return commandLine === "" ? null : commandLine;
    }
    catch {
        return null;
    }
}

function commandLineReferencesExecutable(
    commandLine: string,
    execPath: string,
): boolean {
    const normalizedExecPath = execPath.toLowerCase();
    const executableToken = readCommandLineTokens(commandLine)
        .map(token => stripWrappingQuotes(token).toLowerCase())[0];

    if (executableToken === undefined) {
        return false;
    }

    if (executableToken === normalizedExecPath) {
        return true;
    }

    const executableName = basename(normalizedExecPath);

    return basename(executableToken) === executableName;
}

function readCommandLineTokens(commandLine: string): string[] {
    const tokens: string[] = [];
    let currentToken = "";
    let quoteCharacter: "\"" | "'" | undefined;

    for (const character of commandLine) {
        if (quoteCharacter !== undefined) {
            if (character === quoteCharacter) {
                quoteCharacter = undefined;
                continue;
            }

            currentToken += character;
            continue;
        }

        if (character === "\"" || character === "'") {
            quoteCharacter = character;
            continue;
        }

        if (character === " " || character === "\t") {
            if (currentToken !== "") {
                tokens.push(currentToken);
                currentToken = "";
            }
            continue;
        }

        currentToken += character;
    }

    if (currentToken !== "") {
        tokens.push(currentToken);
    }

    return tokens;
}

function stripWrappingQuotes(value: string): string {
    if (
        value.length >= 2
        && ((value.startsWith("\"") && value.endsWith("\""))
            || (value.startsWith("'") && value.endsWith("'")))
    ) {
        return value.slice(1, -1);
    }

    return value;
}
