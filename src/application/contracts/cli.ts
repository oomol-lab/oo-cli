import type { Logger } from "pino";
import type { ZodError, ZodType } from "zod";

import type { AuthStore } from "./auth-store.ts";
import type { CacheStore } from "./cache.ts";
import type { ConnectorStore } from "./connector-store.ts";
import type { FileDownloadSessionStore } from "./file-download-session-store.ts";
import type { FileUploadRecordStore } from "./file-upload-store.ts";
import type { SelfUpdateRuntimeOverrides } from "./self-update.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { Translator } from "./translator.ts";

export const supportedLocaleValues = ["en", "zh"] as const;
export const supportedShellValues = ["bash", "zsh", "fish"] as const;

export type SupportedLocale = (typeof supportedLocaleValues)[number];
export type SupportedShell = (typeof supportedShellValues)[number];
export type CompletionProvider = "team-names";

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
    on: (event: "data" | "end", listener: (chunk: string | Uint8Array) => void) => void;
    off: (event: "data" | "end", listener: (chunk: string | Uint8Array) => void) => void;
}

export type Fetcher = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

export interface CliOptionDefinition {
    name: string;
    longFlag: string;
    shortFlag?: string;
    aliasFlags?: readonly string[];
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
    completionProvider?: CompletionProvider;
    variadic?: boolean;
}

// Bivariance hack: enables covariant handler input types under --strict.
// Without this, CliCommandHandler<SpecificInput> would not be assignable to
// CliCommandHandler<unknown> due to function parameter contravariance.
export type CliCommandHandler<TInput> = {
    bivarianceHack: (
        input: TInput,
        context: CliCommandContext,
    ) => Promise<void> | void;
}["bivarianceHack"];

export type CliCommandOutputMode = "standard" | "json-only";

export interface CliCommandDefinition<TInput = unknown> {
    name: string;
    aliases?: readonly string[];
    excludeFromTelemetry?: boolean;
    hidden?: boolean;
    summaryKey: string;
    descriptionKey?: string;
    arguments?: readonly CliArgumentDefinition[];
    options?: readonly CliOptionDefinition[];
    /**
     * Declares the command's relationship to the JSON/text output contract.
     * When set, the adapter attaches the shared output options and builds a
     * strict output handle; undeclared commands get an inert text handle.
     */
    output?: CliCommandOutputMode;
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

export type CliParseErrorKind
    = | "excess_arguments"
        | "help"
        | "invalid_argument"
        | "missing_argument"
        | "missing_option_value"
        | "unknown_command"
        | "unknown_option"
        | "version";

export interface CliCommandResolvedEvent {
    argCount: number;
    commandPath: readonly string[];
    excludeFromTelemetry: boolean;
    flagsCount: number;
    outputFormat: "json" | "text";
}

export interface CliCommandCompletedEvent {
    exitCode: number;
}

export interface CliCommandFailedEvent {
    commanderCode?: string;
    errorKey?: string;
    exitCode: number;
    parseErrorKind?: CliParseErrorKind;
}

export interface CliCommandObserver {
    onCommandCompleted?: (event: CliCommandCompletedEvent) => void;
    onCommandFailed?: (event: CliCommandFailedEvent) => void;
    onCommandResolved?: (event: CliCommandResolvedEvent) => void;
    onParseError?: (event: {
        commanderCode?: string;
        parseErrorKind: CliParseErrorKind;
    }) => void;
}

export type CliTelemetryPropertyValue
    = | boolean
        | number
        | readonly string[]
        | string;

export interface CompletionRenderer {
    render: (shell: SupportedShell, catalog: CliCatalog) => string;
}

export interface CommandOutput {
    /** Resolved once per invocation; "json" iff --format json / --json (or json-only mode). */
    format: "json" | "text";
    /** Standard shape: JSON mode writes the payload (with envelope), text mode calls renderText. */
    emit: (payload: unknown, renderText: () => void) => void;
    /** For format-gated paths (report writers, json-only commands): write JSON with envelope. */
    emitJson: (payload: unknown) => void;
}

export interface CliExecutionContext {
    authStore: AuthStore;
    cacheStore: CacheStore;
    connectorStore: ConnectorStore;
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
    selfUpdateRuntime?: SelfUpdateRuntimeOverrides;
    stdout: Writer;
    stderr: Writer;
    telemetry?: {
        recordProperties: (
            properties: Record<string, CliTelemetryPropertyValue>,
        ) => void;
        directoryPath: string;
        suppressCurrentInvocation: () => void;
    };
    translator: Translator;
    completionRenderer: CompletionRenderer;
    catalog: CliCatalog;
    version: string;
    versionText?: string;
}

/** The context command handlers receive: the execution context plus the output handle. */
export interface CliCommandContext extends CliExecutionContext {
    output: CommandOutput;
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
