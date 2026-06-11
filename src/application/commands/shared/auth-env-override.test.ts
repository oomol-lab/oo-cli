import type { AuthAccount } from "../../schemas/auth.ts";

import { describe, expect, test } from "bun:test";

import {
    applyEndpointOverride,
    buildEnvApiKeyAccount,
    readEndpointOverride,
} from "./auth-env-override.ts";

const persistedAccount: AuthAccount = {
    apiKey: "persisted-key",
    endpoint: "oomol.com",
    id: "user-1",
    name: "Alice",
};

describe("buildEnvApiKeyAccount", () => {
    test("returns undefined when OO_API_KEY is unset, empty, or whitespace", () => {
        expect(buildEnvApiKeyAccount({})).toBeUndefined();
        expect(buildEnvApiKeyAccount({ OO_API_KEY: "" })).toBeUndefined();
        expect(buildEnvApiKeyAccount({ OO_API_KEY: "   " })).toBeUndefined();
    });

    test("builds an in-memory account using the default endpoint when OO_ENDPOINT is absent", () => {
        const account = buildEnvApiKeyAccount({ OO_API_KEY: "  env-key  " });

        expect(account).toEqual({
            apiKey: "env-key",
            endpoint: "oomol.com",
            id: "oo-env-override",
            name: "Environment (OO_API_KEY)",
        });
    });

    test("uses OO_ENDPOINT for the in-memory account endpoint when set", () => {
        const account = buildEnvApiKeyAccount({
            OO_API_KEY: "env-key",
            OO_ENDPOINT: "  oomol.dev  ",
        });

        expect(account?.endpoint).toBe("oomol.dev");
        expect(account?.apiKey).toBe("env-key");
    });
});

describe("readEndpointOverride", () => {
    test("returns the trimmed OO_ENDPOINT when set", () => {
        expect(readEndpointOverride({ OO_ENDPOINT: "  oomol.dev " })).toBe("oomol.dev");
    });

    test("returns undefined when OO_ENDPOINT is unset, empty, or whitespace", () => {
        expect(readEndpointOverride({})).toBeUndefined();
        expect(readEndpointOverride({ OO_ENDPOINT: "" })).toBeUndefined();
        expect(readEndpointOverride({ OO_ENDPOINT: "  " })).toBeUndefined();
    });
});

describe("applyEndpointOverride", () => {
    test("overrides the persisted account endpoint when OO_ENDPOINT is set", () => {
        const result = applyEndpointOverride(persistedAccount, {
            OO_ENDPOINT: "oomol.dev",
        });

        expect(result.endpoint).toBe("oomol.dev");
        expect(result.apiKey).toBe("persisted-key");
        expect(result.id).toBe("user-1");
    });

    test("returns the account unchanged when OO_ENDPOINT is absent", () => {
        expect(applyEndpointOverride(persistedAccount, {})).toEqual(persistedAccount);
    });
});
