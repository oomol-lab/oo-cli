import type { CliInvocation } from "../src/application/bootstrap/run-cli.ts";
import type { Fetcher, InteractiveInput, Writer } from "../src/application/contracts/cli.ts";
import { mkdtemp, rm } from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";
import {

    executeCli,
} from "../src/application/bootstrap/run-cli.ts";
import { APP_NAME } from "../src/application/config/app-config.ts";

export interface TextBuffer {
    readonly writer: Writer;
    read: () => string;
}

export interface TextBufferOptions {
    hasColors?: boolean;
}

export interface CliRunOptions {
    fetcher?: Fetcher;
    stderr?: TextBufferOptions;
    stdin?: InteractiveInput;
    stdout?: TextBufferOptions;
}

export interface CliSandbox {
    readonly cwd: string;
    readonly env: Record<string, string | undefined>;
    run: (argv: readonly string[], options?: CliRunOptions) => Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
    }>;
    cleanup: () => Promise<void>;
}

export function createTextBuffer(options: TextBufferOptions = {}): TextBuffer {
    const chunks: string[] = [];
    const writer: Writer = {
        write(chunk) {
            chunks.push(chunk);
        },
    };

    if (options.hasColors !== undefined) {
        const hasColors = options.hasColors;

        writer.hasColors = () => hasColors;
    }

    return {
        writer,
        read() {
            return chunks.join("");
        },
    };
}

export async function createTemporaryDirectory(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), `${prefix}-`));
}

export async function createCliSandbox(): Promise<CliSandbox> {
    const cwd = process.cwd();
    const configRoot = await createTemporaryDirectory(APP_NAME);
    const env: Record<string, string | undefined> = {
        APPDATA: join(configRoot, "appdata"),
        HOME: configRoot,
        LANG: undefined,
        LC_ALL: undefined,
        LC_MESSAGES: undefined,
        USERPROFILE: configRoot,
        XDG_CONFIG_HOME: join(configRoot, "xdg"),
    };

    return {
        cwd,
        env,
        async run(argv, options = {}) {
            const stdout = createTextBuffer(options.stdout);
            const stderr = createTextBuffer(options.stderr);
            const invocation: CliInvocation = {
                argv,
                cwd,
                env,
                fetcher: options.fetcher,
                stdin: options.stdin,
                stdout: stdout.writer,
                stderr: stderr.writer,
                systemLocale: "en-US",
            };
            const exitCode = await executeCli(invocation);

            return {
                exitCode,
                stdout: stdout.read(),
                stderr: stderr.read(),
            };
        },
        async cleanup() {
            await rm(configRoot, { force: true, recursive: true });
        },
    };
}
