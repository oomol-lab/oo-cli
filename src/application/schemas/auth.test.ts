import type { AuthFile } from "./auth.ts";

import { describe, expect, test } from "bun:test";
import {
    authTomlFileSchema,
    getNextAuthAccount,
    renderAuthFile,
} from "./auth.ts";

function createAuthFile(overrides: Partial<AuthFile> = {}): AuthFile {
    return {
        auth: [
            {
                apiKey: "secret-1",
                endpoint: "oomol.com",
                id: "user-1",
                name: "Alice",
            },
            {
                apiKey: "secret-2",
                endpoint: "oomol.com",
                id: "user-2",
                name: "Bob",
            },
            {
                apiKey: "secret-3",
                endpoint: "oomol.com",
                id: "user-3",
                name: "Charlie",
            },
        ],
        id: "user-1",
        ...overrides,
    };
}

describe("getNextAuthAccount", () => {
    test("returns undefined when no saved accounts exist", () => {
        expect(getNextAuthAccount({ auth: [], id: "" })).toBeUndefined();
    });

    test("returns the next account after the active account", () => {
        const nextAccount = getNextAuthAccount(createAuthFile());

        expect(nextAccount?.id).toBe("user-2");
        expect(nextAccount?.name).toBe("Bob");
    });

    test("wraps to the first account after the last account", () => {
        const nextAccount = getNextAuthAccount(createAuthFile({ id: "user-3" }));

        expect(nextAccount?.id).toBe("user-1");
        expect(nextAccount?.name).toBe("Alice");
    });

    test("falls back to the first account when the active id is missing", () => {
        const nextAccount = getNextAuthAccount(createAuthFile({ id: "missing-user" }));

        expect(nextAccount?.id).toBe("user-1");
        expect(nextAccount?.name).toBe("Alice");
    });
});

describe("authTomlFileSchema", () => {
    test("parses lowercase account ids", () => {
        expect(authTomlFileSchema.parse({
            auth: [
                {
                    api_key: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        })).toEqual({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        });
    });

    test("parses legacy uppercase account ids", () => {
        expect(authTomlFileSchema.parse({
            auth: [
                {
                    ID: "user-1",
                    api_key: "secret-1",
                    endpoint: "oomol.com",
                    name: "Alice",
                },
            ],
            id: "user-1",
        })).toEqual({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        });
    });
});

describe("renderAuthFile", () => {
    test("renders lowercase account ids", () => {
        expect(renderAuthFile({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                },
            ],
            id: "user-1",
        })).toBe(
            [
                "id = \"user-1\"",
                "",
                "[[auth]]",
                "id = \"user-1\"",
                "name = \"Alice\"",
                "api_key = \"secret-1\"",
                "endpoint = \"oomol.com\"",
                "",
            ].join("\n"),
        );
    });
});
