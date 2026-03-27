import type { Logger } from "pino";
import type { CliInvocation } from "../src/application/bootstrap/run-cli.ts";
import type { Fetcher, InteractiveInput, Writer } from "../src/application/contracts/cli.ts";
import type { FileDownloadSessionStore } from "../src/application/contracts/file-download-session-store.ts";
import type { FileUploadRecordStore } from "../src/application/contracts/file-upload-store.ts";
import { mkdtemp, rm } from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import pino from "pino";
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
    isTTY?: boolean;
}

export interface CliRunOptions {
    fetcher?: Fetcher;
    packageName?: string;
    stderr?: TextBufferOptions;
    stdin?: InteractiveInput;
    stdout?: TextBufferOptions;
    version?: string;
}

export interface CreateCliSandboxOptions {
    cwd?: string;
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

export interface LogCapture {
    readonly logger: Logger;
    close: () => void;
    read: () => string;
}

export function createNoopFileUploadStore(): FileUploadRecordStore {
    return {
        close() {},
        deleteExpired: () => 0,
        getFilePath: () => "",
        list: () => [],
        save() {},
    };
}

export function createNoopFileDownloadSessionStore(): FileDownloadSessionStore {
    return {
        close() {},
        deleteDownloadSession: () => false,
        deleteDownloadSessionsUpdatedBefore: () => 0,
        findDownloadSession: () => undefined,
        getFilePath: () => "",
        saveDownloadSession() {},
    };
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

    if (options.isTTY !== undefined) {
        writer.isTTY = options.isTTY;
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

export function createLogCapture(): LogCapture {
    const chunks: string[] = [];
    const stream = new PassThrough();

    stream.on("data", (chunk) => {
        chunks.push(chunk.toString());
    });

    return {
        logger: pino(
            {
                formatters: {
                    level(label) {
                        return { level: label };
                    },
                },
                level: "debug",
            },
            stream,
        ),
        close() {
            stream.end();
        },
        read() {
            return chunks.join("");
        },
    };
}

export async function createCliSandbox(
    options: CreateCliSandboxOptions = {},
): Promise<CliSandbox> {
    const configRoot = await createTemporaryDirectory(APP_NAME);
    const cwd = options.cwd ?? await createTemporaryDirectory(`${APP_NAME}-cwd`);
    const shouldCleanupCwd = options.cwd === undefined;
    const env: Record<string, string | undefined> = {
        APPDATA: join(configRoot, "appdata"),
        HOME: configRoot,
        LANG: undefined,
        LC_ALL: undefined,
        LC_MESSAGES: undefined,
        LOCALAPPDATA: join(configRoot, "local-appdata"),
        USERPROFILE: configRoot,
        XDG_CONFIG_HOME: join(configRoot, "xdg"),
        XDG_STATE_HOME: join(configRoot, "xdg-state"),
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
                packageName: options.packageName,
                stdin: options.stdin,
                stdout: stdout.writer,
                stderr: stderr.writer,
                systemLocale: "en-US",
                version: options.version,
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

            if (shouldCleanupCwd) {
                await rm(cwd, { force: true, recursive: true });
            }
        },
    };
}
