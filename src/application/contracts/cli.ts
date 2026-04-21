import type { Logger } from "pino";
import type { ZodError, ZodType } from "zod";

import type { AuthStore } from "./auth-store.ts";
import type { CacheStore } from "./cache.ts";
import type { FileDownloadSessionStore } from "./file-download-session-store.ts";
import type { FileUploadRecordStore } from "./file-upload-store.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { Translator } from "./translator.ts";

export const supportedLocaleValues = ["en", "zh"] as const;
export const supportedShellValues = ["bash", "zsh", "fish"] as const;

export type SupportedLocale = (typeof supportedLocaleValues)[number];
export type SupportedShell = (typeof supportedShellValues)[number];

export interface Writer {
    write: (chunk: string) => void;
    hasColors?: () => boolean;
    isTTY?: boolean;
}

export interface InteractiveInput {
    readonly isTTY?: boolean;
    setRawMode?: (value: boolean) => void;
    resume?: () => void;
    pause?: () => void;
    on: (event: "data", listener: (chunk: string | Uint8Array) => void) => void;
    off: (event: "data", listener: (chunk: string | Uint8Array) => void) => void;
}

export type Fetcher = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

export interface CliOptionDefinition {
    name: string;
    longFlag: string;
    shortFlag?: string;
    valueName?: string;
    descriptionKey: string;
    global?: boolean;
    implies?: Record<string, unknown>;
}

export interface CliArgumentDefinition {
    name: string;
    descriptionKey: string;
    required?: boolean;
    choices?: readonly string[];
    variadic?: boolean;
}

// Bivariance hack: enables covariant handler input types under --strict.
// Without this, CliCommandHandler<SpecificInput> would not be assignable to
// CliCommandHandler<unknown> due to function parameter contravariance.
export type CliCommandHandler<TInput> = {
    bivarianceHack: (
        input: TInput,
        context: CliExecutionContext,
    ) => Promise<void> | void;
}["bivarianceHack"];

export interface CliCommandDefinition<TInput = unknown> {
    name: string;
    aliases?: readonly string[];
    summaryKey: string;
    descriptionKey?: string;
    arguments?: readonly CliArgumentDefinition[];
    options?: readonly CliOptionDefinition[];
    missingArgumentBehavior?: "error" | "showHelp";
    inputSchema?: ZodType;
    mapInputError?: (
        error: ZodError,
        rawInput: Record<string, unknown>,
    ) => CliUserError;
    handler?: CliCommandHandler<TInput>;
    children?: readonly CliCommandDefinition<any>[];
}

export interface CliCatalog {
    name: string;
    descriptionKey: string;
    globalOptions: readonly CliOptionDefinition[];
    commands: readonly CliCommandDefinition<any>[];
}

export interface CompletionRenderer {
    render: (shell: SupportedShell, catalog: CliCatalog) => string;
}

export interface CliExecutionContext {
    authStore: AuthStore;
    cacheStore: CacheStore;
    fileDownloadSessionStore: FileDownloadSessionStore;
    fileUploadStore: FileUploadRecordStore;
    currentLogFilePath: string;
    execPath: string;
    fetcher: Fetcher;
    cwd: string;
    env: Record<string, string | undefined>;
    stdin: InteractiveInput;
    logger: Logger;
    packageName: string;
    settingsStore: SettingsStore;
    stdout: Writer;
    stderr: Writer;
    translator: Translator;
    completionRenderer: CompletionRenderer;
    catalog: CliCatalog;
    version: string;
    versionText?: string;
}

export type CliMessageParams = Record<string, string | number>;

export class CliUserError extends Error {
    readonly exitCode: number;
    readonly key: string;
    readonly params?: CliMessageParams;

    constructor(key: string, exitCode: number, params?: CliMessageParams) {
        super(key);
        this.name = "CliUserError";
        this.key = key;
        this.exitCode = exitCode;
        this.params = params;
    }
}
