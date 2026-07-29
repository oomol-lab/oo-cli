import type { AuthFile } from "./auth.ts";

import { describe, expect, test } from "bun:test";
import {
    authTomlFileSchema,
    clearAccountDefaultTeam,
    getNextAuthAccount,
    renderAuthFile,
    setAccountDefaultTeam,
    upsertAuthAccount,
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

    test("parses the account default team", () => {
        expect(authTomlFileSchema.parse({
            auth: [
                {
                    api_key: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                    team: "acme",
                    team_id: "team-1",
                },
            ],
            id: "user-1",
        }).auth[0]).toEqual({
            apiKey: "secret-1",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
            team: "acme",
            teamId: "team-1",
        });
    });

    test("treats a blank default team as unset", () => {
        expect(authTomlFileSchema.parse({
            auth: [
                {
                    api_key: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                    team: "   ",
                    team_id: "",
                },
            ],
            id: "user-1",
        }).auth[0]).toEqual({
            apiKey: "secret-1",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
        });
    });

    test("ignores unknown account keys instead of rejecting the file", () => {
        expect(authTomlFileSchema.parse({
            auth: [
                {
                    api_key: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                    written_by_a_newer_cli: "value",
                },
            ],
            id: "user-1",
        }).auth[0]).toEqual({
            apiKey: "secret-1",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
        });
    });
});

describe("setAccountDefaultTeam", () => {
    test("stores the name and id on the named account only", () => {
        const next = setAccountDefaultTeam(createAuthFile(), "user-2", {
            id: "team-1",
            name: "acme",
        });

        expect(next.auth[1]).toEqual({
            apiKey: "secret-2",
            endpoint: "oomol.com",
            id: "user-2",
            name: "Bob",
            team: "acme",
            teamId: "team-1",
        });
        expect(next.auth[0]?.team).toBeUndefined();
    });

    test("drops a stale id when the new default carries none", () => {
        const withId = setAccountDefaultTeam(createAuthFile(), "user-1", {
            id: "team-1",
            name: "acme",
        });
        const next = setAccountDefaultTeam(withId, "user-1", {
            id: null,
            name: "contoso",
        });

        expect(next.auth[0]?.team).toBe("contoso");
        expect(next.auth[0]?.teamId).toBeUndefined();
    });

    test("leaves the file untouched when the account is unknown", () => {
        const authFile = createAuthFile();

        expect(setAccountDefaultTeam(authFile, "missing-user", {
            id: null,
            name: "acme",
        })).toBe(authFile);
    });
});

describe("clearAccountDefaultTeam", () => {
    test("removes both team fields", () => {
        const withTeam = setAccountDefaultTeam(createAuthFile(), "user-1", {
            id: "team-1",
            name: "acme",
        });
        const next = clearAccountDefaultTeam(withTeam, "user-1");

        expect(next.auth[0]).toEqual({
            apiKey: "secret-1",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
        });
    });

    test("leaves the file untouched when no default team is stored", () => {
        const authFile = createAuthFile();

        expect(clearAccountDefaultTeam(authFile, "user-1")).toBe(authFile);
    });
});

describe("upsertAuthAccount", () => {
    test("keeps the stored default team when the account logs in again", () => {
        const withTeam = setAccountDefaultTeam(createAuthFile(), "user-1", {
            id: "team-1",
            name: "acme",
        });
        const next = upsertAuthAccount(withTeam, {
            apiKey: "rotated-secret",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
        });

        expect(next.auth[0]).toEqual({
            apiKey: "rotated-secret",
            endpoint: "oomol.com",
            id: "user-1",
            name: "Alice",
            team: "acme",
            teamId: "team-1",
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

    test("renders the account default team when one is stored", () => {
        expect(renderAuthFile({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                    team: "acme",
                    teamId: "team-1",
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
                "team = \"acme\"",
                "team_id = \"team-1\"",
                "",
            ].join("\n"),
        );
    });

    test("omits the team id line when only the name is known", () => {
        expect(renderAuthFile({
            auth: [
                {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                    name: "Alice",
                    team: "acme",
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
                "team = \"acme\"",
                "",
            ].join("\n"),
        );
    });
});
