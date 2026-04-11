import type { Logger } from "pino";
import type { CliInvocation } from "../src/application/bootstrap/run-cli.ts";
import type { AuthStore } from "../src/application/contracts/auth-store.ts";
import type { Cache, CacheOptions, CacheStore } from "../src/application/contracts/cache.ts";
import type { Fetcher, InteractiveInput, Writer } from "../src/application/contracts/cli.ts";
import type { FileDownloadSessionStore } from "../src/application/contracts/file-download-session-store.ts";
import type { FileUploadRecordStore } from "../src/application/contracts/file-upload-store.ts";
import type { SettingsStore } from "../src/application/contracts/settings-store.ts";
import type { AuthFile } from "../src/application/schemas/auth.ts";
import type { AppSettings } from "../src/application/schemas/settings.ts";
import { Buffer } from "node:buffer";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import pino from "pino";
import {
    downloadResumeSessionsTableName,
} from "../src/adapters/store/sqlite-file-download-session-store.ts";
import { resolveStorePaths } from "../src/adapters/store/store-path.ts";
import {
    executeCli as executeCliInvocation,
} from "../src/application/bootstrap/run-cli.ts";
import { APP_NAME } from "../src/application/config/app-config.ts";
import { defaultSettings, renderSettingsFile } from "../src/application/schemas/settings.ts";
import { createTerminalColors } from "../src/application/terminal-colors.ts";

export interface TextBuffer {
    readonly writer: Writer;
    read: () => string;
}

export interface TestInteractiveInput extends InteractiveInput {
    feed: (chunk: string) => void;
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

export interface CliRunResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}

export interface SnapshotReplacement {
    readonly placeholder: string;
    readonly value: string | undefined;
}

export interface CliSnapshotContext {
    readonly cwd: string;
    readonly env: Record<string, string | undefined>;
}

export interface CliSnapshotOptions {
    readonly replacements?: readonly SnapshotReplacement[];
    readonly sandbox?: CliSnapshotContext;
    readonly stripAnsi?: boolean;
}

export interface LogCapture {
    readonly logger: Logger;
    close: () => void;
    read: () => string;
}

export interface PlatformScope<T> {
    readonly darwin: T;
    readonly linux: T;
    readonly win32: T;
}

export interface AuthAccountFixture {
    readonly id: string;
    readonly name: string;
    readonly apiKey: string;
    readonly endpoint: string;
}

export interface PrintedAuthLoginOptions {
    accountEndpoint?: string;
    argv?: readonly string[];
    stdoutHasColors?: boolean;
}

export const defaultAuthEndpoint = "oomol.com";

export function createPlatformScope<T>(
    conditional: {
        if: (condition: boolean) => T;
    },
    currentPlatform: NodeJS.Platform = process.platform,
): PlatformScope<T> {
    return {
        darwin: conditional.if(currentPlatform === "darwin"),
        linux: conditional.if(currentPlatform === "linux"),
        win32: conditional.if(currentPlatform === "win32"),
    };
}

export const platformTest = createPlatformScope(test);

export const platformDescribe = createPlatformScope(describe);

export const defaultSettingsFileContent = renderSettingsFile(defaultSettings);

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

export function createInteractiveInput(): TestInteractiveInput {
    const listeners = new Set<(chunk: string | Uint8Array) => void>();
    const bufferedChunks: Uint8Array[] = [];
    const textEncoder = new TextEncoder();

    return {
        isTTY: true,
        feed(chunk) {
            const encodedChunk = textEncoder.encode(chunk);

            if (listeners.size === 0) {
                bufferedChunks.push(encodedChunk);
                return;
            }

            for (const listener of listeners) {
                listener(encodedChunk);
            }
        },
        off(_, listener) {
            listeners.delete(listener);
        },
        on(_, listener) {
            listeners.add(listener);

            while (bufferedChunks.length > 0) {
                const chunk = bufferedChunks.shift();

                if (chunk === undefined) {
                    break;
                }

                listener(chunk);
            }
        },
        pause() {},
        resume() {},
        setRawMode() {},
    };
}

export async function waitForOutputText(
    buffer: Pick<TextBuffer, "read">,
    text: string,
): Promise<void> {
    const deadline = Date.now() + 1000;

    while (Date.now() < deadline) {
        if (buffer.read().includes(text)) {
            return;
        }

        await Bun.sleep(10);
    }

    throw new Error(`Timed out waiting for output text: ${text}`);
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
            const exitCode = await executeCliInvocation(invocation);

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

export async function writeAuthFile(
    sandbox: CliSandbox,
    options: {
        activeId?: string;
        accounts?: readonly AuthAccountFixture[];
    } = {},
): Promise<string> {
    const accounts = options.accounts ?? [
        {
            id: "user-1",
            name: "Alice",
            apiKey: "secret-1",
            endpoint: defaultAuthEndpoint,
        },
    ];
    const activeId = options.activeId ?? accounts[0]?.id ?? "";
    const filePath = join(
        sandbox.env.XDG_CONFIG_HOME!,
        APP_NAME,
        "auth.toml",
    );
    const content = [
        `id = "${activeId}"`,
        "",
        ...accounts.flatMap(account => [
            "[[auth]]",
            `id = "${account.id}"`,
            `name = "${account.name}"`,
            `api_key = "${account.apiKey}"`,
            `endpoint = "${account.endpoint}"`,
            "",
        ]),
    ].join("\n");

    await Bun.write(filePath, content);

    return filePath;
}

export async function runPrintedAuthLogin(
    sandbox: CliSandbox,
    apiKeyValue: string,
    options: PrintedAuthLoginOptions = {},
): Promise<CliRunResult> {
    const stdout = createTextBuffer({
        hasColors: options.stdoutHasColors,
    });
    const stderr = createTextBuffer();
    const execution = executeCliInvocation({
        argv: options.argv ?? ["auth", "login"],
        cwd: sandbox.cwd,
        env: sandbox.env,
        stdout: stdout.writer,
        stderr: stderr.writer,
        systemLocale: "en-US",
    });
    const loginUrl = await waitForLoginUrl(stdout);

    await completeLoginCallback(
        loginUrl,
        apiKeyValue,
        options.accountEndpoint ?? defaultAuthEndpoint,
    );

    return {
        exitCode: await execution,
        stdout: stdout.read(),
        stderr: stderr.read(),
    };
}

export async function readLatestLogContent(sandbox: CliSandbox): Promise<string> {
    const logDirectoryPath = resolveStorePaths({
        appName: APP_NAME,
        env: sandbox.env,
        platform: process.platform,
    }).logDirectoryPath;
    const logFileNames = await readdir(logDirectoryPath);
    const logFilesWithMetadata = await Promise.all(
        logFileNames.map(async fileName => ({
            fileName,
            metadata: await stat(join(logDirectoryPath, fileName)),
        })),
    );
    const latestLogFileName = logFilesWithMetadata
        .sort((left, right) => {
            const modifiedAtDelta = left.metadata.mtimeMs - right.metadata.mtimeMs;

            if (modifiedAtDelta !== 0) {
                return modifiedAtDelta;
            }

            return left.fileName.localeCompare(right.fileName);
        })
        .at(-1)
        ?.fileName;

    if (!latestLogFileName) {
        throw new Error("Expected at least one log file.");
    }

    return await readFile(join(logDirectoryPath, latestLogFileName), "utf8");
}

export function countDownloadResumeSessions(downloadSessionsFilePath: string): number {
    const database = new Database(downloadSessionsFilePath, {
        strict: true,
    });

    try {
        const row = database.query(
            `SELECT COUNT(*) AS count FROM ${downloadResumeSessionsTableName}`,
        ).get() as {
            count: number;
        };

        return row.count;
    }
    finally {
        database.close();
    }
}

export function readFileDownloadSuccessOutput(path: string): string {
    return `Saved to: ${path}\n`;
}

export function createCliSnapshot(
    result: CliRunResult,
    options: CliSnapshotOptions = {},
): CliRunResult {
    const replacements = resolveSnapshotReplacements(options);

    return {
        exitCode: result.exitCode,
        stdout: normalizeSnapshotText(result.stdout, replacements, options.stripAnsi),
        stderr: normalizeSnapshotText(result.stderr, replacements, options.stripAnsi),
    };
}

export function expectCliSnapshot(
    result: CliRunResult,
    options: CliSnapshotOptions = {},
): void {
    expect(createCliSnapshot(result, options)).toMatchSnapshot();
}

export function readAuthLoginUrlPrefix(endpoint: string): string {
    return `https://api.${endpoint}/v1/auth/redirect?`;
}

export interface ConnectorActionFixtureOverrides {
    description?: string;
    inputSchema?: Record<string, unknown>;
    name?: string;
    outputSchema?: Record<string, unknown>;
    service?: string;
}

export interface ConnectorActionFixture {
    description: string;
    inputSchema: Record<string, unknown>;
    name: string;
    outputSchema: Record<string, unknown>;
    service: string;
}

export function createConnectorActionFixture(
    overrides: ConnectorActionFixtureOverrides = {},
): ConnectorActionFixture {
    return {
        description: overrides.description ?? "Send a Gmail message.",
        inputSchema: overrides.inputSchema ?? {
            type: "object",
        },
        name: overrides.name ?? "send_mail",
        outputSchema: overrides.outputSchema ?? {
            type: "object",
        },
        service: overrides.service ?? "gmail",
    };
}

export function toRequest(input: string | URL | Request, init?: RequestInit): Request {
    if (input instanceof Request) {
        return new Request(input, init);
    }

    return new Request(String(input), init);
}

async function waitForLoginUrl(
    stdout: ReturnType<typeof createTextBuffer>,
): Promise<string> {
    const deadline = Date.now() + 1000;

    while (Date.now() < deadline) {
        const loginUrl = findLoginUrl(stdout.read());

        if (loginUrl !== undefined) {
            return loginUrl;
        }

        await Bun.sleep(10);
    }

    throw new Error("Timed out waiting for the printed login URL.");
}

export function findLoginUrl(output: string): string | undefined {
    const plainOutput = createTerminalColors(true).strip(output);

    for (const line of plainOutput.split("\n")) {
        const urlStart = line.indexOf("https://");

        if (urlStart < 0) {
            continue;
        }

        const candidate = line.slice(urlStart).trim();

        if (candidate.includes("/v1/auth/redirect?")) {
            return candidate;
        }
    }

    return undefined;
}

function normalizeSnapshotText(
    value: string,
    replacements: readonly ResolvedSnapshotReplacement[],
    stripAnsi = false,
): string {
    let normalized = value
        .split("\r\n")
        .join("\n")
        .split("\r")
        .join("\n");

    if (stripAnsi) {
        normalized = createTerminalColors(true).strip(normalized);
    }

    for (const replacement of replacements) {
        normalized = replaceSnapshotValue(
            normalized,
            replacement.value,
            replacement.placeholder,
        );
        normalized = replaceSnapshotValue(
            normalized,
            JSON.stringify(replacement.value).slice(1, -1),
            replacement.placeholder,
        );

        const portableValue = replacement.value
            .split("\\")
            .join("/");

        if (portableValue !== replacement.value) {
            normalized = replaceSnapshotValue(
                normalized,
                portableValue,
                replacement.placeholder,
            );
            normalized = replaceSnapshotValue(
                normalized,
                JSON.stringify(portableValue).slice(1, -1),
                replacement.placeholder,
            );
        }
    }

    return normalizeBackslashRunsToSlash(normalized);
}

function replaceSnapshotValue(
    value: string,
    searchValue: string,
    replacementValue: string,
): string {
    return value.split(searchValue).join(replacementValue);
}

function normalizeBackslashRunsToSlash(
    value: string,
): string {
    let normalized = "";
    let index = 0;

    while (index < value.length) {
        const char = value[index];

        if (char !== "\\") {
            normalized += char;
            index += 1;
            continue;
        }

        normalized += "/";

        while (value[index] === "\\") {
            index += 1;
        }
    }

    return normalized;
}

function resolveSnapshotReplacements(
    options: CliSnapshotOptions,
): readonly ResolvedSnapshotReplacement[] {
    const replacements = [
        ...createSandboxSnapshotReplacements(options.sandbox),
        ...(options.replacements ?? []),
    ];

    return replacements
        .filter((replacement): replacement is ResolvedSnapshotReplacement =>
            replacement.value !== undefined && replacement.value.length > 0,
        )
        .sort((left, right) => right.value.length - left.value.length);
}

function createSandboxSnapshotReplacements(
    sandbox?: CliSnapshotContext,
): readonly SnapshotReplacement[] {
    if (!sandbox) {
        return [];
    }

    return [
        {
            placeholder: "<APPDATA>",
            value: sandbox.env.APPDATA,
        },
        {
            placeholder: "<CWD>",
            value: sandbox.cwd,
        },
        {
            placeholder: "<HOME>",
            value: sandbox.env.HOME,
        },
        {
            placeholder: "<LOCALAPPDATA>",
            value: sandbox.env.LOCALAPPDATA,
        },
        {
            placeholder: "<USERPROFILE>",
            value: sandbox.env.USERPROFILE,
        },
        {
            placeholder: "<XDG_CONFIG_HOME>",
            value: sandbox.env.XDG_CONFIG_HOME,
        },
        {
            placeholder: "<XDG_STATE_HOME>",
            value: sandbox.env.XDG_STATE_HOME,
        },
    ];
}

async function completeLoginCallback(
    loginUrlValue: string,
    apiKeyValue: string,
    endpoint: string,
): Promise<void> {
    const loginUrl = new URL(loginUrlValue);

    expect(loginUrl.searchParams.get("cli_login")).toBe("true");

    const redirectUrl = loginUrl.searchParams.get("redirect");

    expect(redirectUrl).toBeTruthy();

    const callbackUrl = new URL(redirectUrl!);
    const requestUrl = new URL(callbackUrl.toString());
    const encodedApiKey = Buffer.from(apiKeyValue, "utf8").toString("base64");

    requestUrl.searchParams.set("apiKey", encodedApiKey);
    requestUrl.searchParams.set("name", "Alice");
    requestUrl.searchParams.set("endpoint", endpoint);
    requestUrl.searchParams.set("id", "user-1");

    const response = await fetch(requestUrl);

    expect(response.status).toBe(200);
}

interface ResolvedSnapshotReplacement {
    readonly placeholder: string;
    readonly value: string;
}

export async function createRegistrySkillArchiveBytes(
    files: Record<string, string>,
): Promise<Uint8Array<ArrayBuffer>> {
    return await new Bun.Archive(files, {
        compress: "gzip",
    }).bytes();
}

export function createAuthStore(authFile: AuthFile): AuthStore {
    let currentAuthFile = authFile;

    return {
        getFilePath: () => "",
        read: async () => currentAuthFile,
        write: async (nextAuthFile) => {
            currentAuthFile = nextAuthFile;

            return currentAuthFile;
        },
        update: async (updater) => {
            currentAuthFile = updater(currentAuthFile);

            return currentAuthFile;
        },
    };
}

export function createSettingsStore(settings: AppSettings): SettingsStore {
    let currentSettings = settings;

    return {
        getFilePath: () => "",
        read: async () => currentSettings,
        write: async (nextSettings) => {
            currentSettings = nextSettings;

            return currentSettings;
        },
        update: async (updater) => {
            currentSettings = updater(currentSettings);

            return currentSettings;
        },
    };
}

export function createCacheStore<Value>(
    cache?: Cache<Value>,
    cacheOptions?: CacheOptions[],
): CacheStore {
    return {
        getFilePath: () => "",
        getCache: <CurrentValue>(options: CacheOptions) => {
            cacheOptions?.push(options);

            return (cache ?? { clear() {}, delete: () => false, get: () => null, has: () => false, set() {} }) as unknown as Cache<CurrentValue>;
        },
        close() {},
    };
}

export function createCache<Value>(handlers: {
    delete: Cache<Value>["delete"];
    get: Cache<Value>["get"];
    set: Cache<Value>["set"];
}): Cache<Value> {
    return {
        delete: handlers.delete,
        get: handlers.get,
        set: handlers.set,
        has(key) {
            return handlers.get(key) !== null;
        },
        clear: () => {},
    };
}
