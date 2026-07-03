import type {
    CliCatalog,
    CliExecutionContext,
    InteractiveInput,
} from "../../contracts/cli.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { AuthFile } from "../../schemas/auth.ts";
import type { ConnectorFile } from "../../schemas/connector.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createInMemoryConnectorStore,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTextBuffer,
    expectCliUserError,
} from "../../../../__tests__/helpers.ts";
import {
    normalizeSelfHostedConnectorToken,
    normalizeSelfHostedConnectorUrl,
    resolveConnectorTarget,
} from "./target.ts";

describe("normalizeSelfHostedConnectorUrl", () => {
    test("accepts a plain http localhost URL", () => {
        expect(normalizeSelfHostedConnectorUrl("http://localhost:3000"))
            .toBe("http://localhost:3000");
    });

    test("accepts a plain https URL", () => {
        expect(normalizeSelfHostedConnectorUrl("https://connect.example.com"))
            .toBe("https://connect.example.com");
    });

    test("strips a trailing slash", () => {
        expect(normalizeSelfHostedConnectorUrl("http://localhost:3000/"))
            .toBe("http://localhost:3000");
    });

    test("strips repeated trailing slashes", () => {
        expect(normalizeSelfHostedConnectorUrl("http://localhost:3000///"))
            .toBe("http://localhost:3000");
    });

    test("preserves a path prefix", () => {
        expect(normalizeSelfHostedConnectorUrl("http://host/prefix"))
            .toBe("http://host/prefix");
    });

    test("strips the trailing slash after a path prefix", () => {
        expect(normalizeSelfHostedConnectorUrl("https://connect.example.com/oo/connector/"))
            .toBe("https://connect.example.com/oo/connector");
    });

    test("lowercases scheme and host through URL parsing", () => {
        expect(normalizeSelfHostedConnectorUrl("HTTP://LocalHost:3000"))
            .toBe("http://localhost:3000");
    });

    test("trims surrounding whitespace before parsing", () => {
        expect(normalizeSelfHostedConnectorUrl("  http://localhost:3000  "))
            .toBe("http://localhost:3000");
    });

    test("rejects empty and whitespace-only input", () => {
        for (const rawUrl of ["", "   "]) {
            const error = expectCliUserError(
                () => normalizeSelfHostedConnectorUrl(rawUrl),
            );

            expect(error.key).toBe("errors.connectorLogin.invalidUrl");
            expect(error.exitCode).toBe(2);
        }
    });

    test("rejects a scheme-less host (parses as a non-http protocol)", () => {
        // "localhost:3000" parses as a URL whose protocol is "localhost:",
        // so it must fall into the non-http rejection branch.
        const error = expectCliUserError(
            () => normalizeSelfHostedConnectorUrl("localhost:3000"),
        );

        expect(error.key).toBe("errors.connectorLogin.invalidUrl");
        expect(error.exitCode).toBe(2);
    });

    test("rejects non-http schemes", () => {
        const error = expectCliUserError(
            () => normalizeSelfHostedConnectorUrl("ftp://example.com"),
        );

        expect(error.key).toBe("errors.connectorLogin.invalidUrl");
        expect(error.exitCode).toBe(2);
    });

    test("rejects URLs with a query or hash", () => {
        for (const rawUrl of [
            "http://localhost:3000/?debug=1",
            "http://localhost:3000/#section",
        ]) {
            const error = expectCliUserError(
                () => normalizeSelfHostedConnectorUrl(rawUrl),
            );

            expect(error.key).toBe("errors.connectorLogin.invalidUrl");
            expect(error.exitCode).toBe(2);
        }
    });
});

describe("normalizeSelfHostedConnectorToken", () => {
    test("returns the trimmed token", () => {
        expect(normalizeSelfHostedConnectorToken("  oct_token  "))
            .toBe("oct_token");
    });

    test("rejects an empty or whitespace-only token", () => {
        for (const rawToken of ["", "   "]) {
            const error = expectCliUserError(
                () => normalizeSelfHostedConnectorToken(rawToken),
            );

            expect(error.key).toBe("errors.connectorLogin.invalidToken");
            expect(error.exitCode).toBe(2);
        }
    });

    test("rejects tokens containing whitespace or control characters", () => {
        const invalidTokens = [
            "oct 123", // embedded space
            "oct\t123", // tab
            "oct\n123", // newline
            "oct\r123", // carriage return
            "oct\u{7F}123", // DEL control character
        ];

        for (const rawToken of invalidTokens) {
            const error = expectCliUserError(
                () => normalizeSelfHostedConnectorToken(rawToken),
            );

            expect(error.key).toBe("errors.connectorLogin.invalidToken");
            expect(error.exitCode).toBe(2);
        }
    });
});

describe("resolveConnectorTarget", () => {
    const persistedAccount = {
        id: "user-1",
        name: "Test User",
        apiKey: "raw-api-key",
        endpoint: "oomol.com",
    };

    test("prefers OO_CONNECTOR_URL over OO_API_KEY, connector.toml, and the active account", async () => {
        const context = createTargetContext({
            auth: { auth: [persistedAccount], id: persistedAccount.id },
            connectorFile: {
                selfHosted: { url: "http://file-host:4000", token: "oct_file" },
            },
            env: {
                OO_API_KEY: "env-key",
                OO_CONNECTOR_TOKEN: "oct_env",
                OO_CONNECTOR_URL: "http://localhost:3000/",
            },
        });

        const target = await resolveConnectorTarget(context);

        expect(target).toEqual({
            authorization: "Bearer oct_env",
            baseUrl: "http://localhost:3000",
            cacheAccountId: "self-hosted",
            cacheEndpoint: "http://localhost:3000",
            kind: "self_hosted",
        });
        expect(target.cacheEndpoint).toBe(target.baseUrl);
    });

    test("omits the authorization value when OO_CONNECTOR_TOKEN is unset", async () => {
        const context = createTargetContext({
            env: { OO_CONNECTOR_URL: "http://localhost:3000" },
        });

        const target = await resolveConnectorTarget(context);

        expect(target.kind).toBe("self_hosted");
        expect(target.authorization).toBeUndefined();
    });

    test("rejects an invalid OO_CONNECTOR_URL with the login validation error", async () => {
        const context = createTargetContext({
            env: { OO_CONNECTOR_URL: "localhost:3000" },
        });

        const error = await expectCliUserError(resolveConnectorTarget(context));

        expect(error.key).toBe("errors.connectorLogin.invalidUrl");
        expect(error.exitCode).toBe(2);
    });

    test("prefers OO_API_KEY over a persisted self-hosted connector", async () => {
        // Documented contract: an explicit env credential beats saved state,
        // so connector.toml must not hijack OO_API_KEY runs.
        const context = createTargetContext({
            connectorFile: {
                selfHosted: { url: "http://file-host:4000", token: "oct_file" },
            },
            env: { OO_API_KEY: "env-key", OO_ENDPOINT: "oomol.dev" },
        });

        const target = await resolveConnectorTarget(context);

        expect(target).toEqual({
            authorization: "env-key",
            baseUrl: "https://connector.oomol.dev",
            cacheAccountId: "oo-env-override",
            cacheEndpoint: "oomol.dev",
            kind: "oomol",
        });
    });

    test("uses the persisted self-hosted connector when no env override is set", async () => {
        const context = createTargetContext({
            auth: { auth: [persistedAccount], id: persistedAccount.id },
            connectorFile: {
                selfHosted: {
                    url: "https://connect.example.com/prefix/",
                    token: "oct_file",
                },
            },
        });

        const target = await resolveConnectorTarget(context);

        expect(target).toEqual({
            authorization: "Bearer oct_file",
            baseUrl: "https://connect.example.com/prefix",
            cacheAccountId: "self-hosted",
            cacheEndpoint: "https://connect.example.com/prefix",
            kind: "self_hosted",
        });
    });

    test("falls back to the active OOMOL account", async () => {
        const context = createTargetContext({
            auth: { auth: [persistedAccount], id: persistedAccount.id },
        });

        const target = await resolveConnectorTarget(context);

        expect(target).toEqual({
            // The OOMOL service expects the raw API key, not a Bearer prefix.
            authorization: "raw-api-key",
            baseUrl: "https://connector.oomol.com",
            cacheAccountId: "user-1",
            cacheEndpoint: "oomol.com",
            kind: "oomol",
        });
    });

    test("throws the standard auth-required error when nothing is configured", async () => {
        const context = createTargetContext();

        const error = await expectCliUserError(resolveConnectorTarget(context));

        expect(error.key).toBe("errors.auth.required");
        expect(error.exitCode).toBe(1);
    });
});

const emptyCatalog: CliCatalog = {
    name: "oo",
    descriptionKey: "catalog.description",
    globalOptions: [],
    commands: [],
};
const translator: Translator = {
    locale: "en",
    t: key => key,
    resolveLocale: () => "en",
};
const stdin: InteractiveInput = {
    on() {},
    off() {},
};

function createTargetContext(
    options: {
        auth?: AuthFile;
        connectorFile?: ConnectorFile;
        env?: Record<string, string | undefined>;
    } = {},
): CliExecutionContext {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        authStore: createAuthStore(options.auth ?? { auth: [], id: "" }),
        cacheStore: createCacheStore(),
        connectorStore: createInMemoryConnectorStore(options.connectorFile ?? {}),
        currentLogFilePath: "",
        execPath: process.execPath,
        fetcher: async () => new Response(null),
        cwd: process.cwd(),
        env: options.env ?? {},
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        stdin,
        logger: pino({
            enabled: false,
        }),
        packageName: "@oomol-lab/oo-cli",
        settingsStore: createSettingsStore({}),
        stdout: stdout.writer,
        stderr: stderr.writer,
        translator,
        completionRenderer: {
            render: () => "",
        },
        catalog: emptyCatalog,
        version: "0.1.0",
    };
}
