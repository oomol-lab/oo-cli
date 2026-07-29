import type { CliSandbox } from "../../../../__tests__/helpers.ts";
import type { Fetcher } from "../../contracts/cli.ts";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    expectTelemetryFreeOfTeamIdentity,
    toRequest,
    writeAuthFile,
    writeAuthFileWithDefaultTeam,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";

const teamsResponse = {
    teams: [
        {
            id: "team-1",
            name: "acme",
            avatar: "",
            creator_user_id: "user-1",
            role: "creator",
            system_created: false,
        },
        {
            id: "team-2",
            name: "beta",
            role: "member",
            system_created: false,
        },
    ],
};

describe("teamCommand CLI", () => {
    test("lists accessible teams as JSON and marks the configured default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const requests: Request[] = [];
            const result = await sandbox.run(["team", "list", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(teamsResponse));
                },
            });
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "team.list");

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://relation-control.oomol.com/v1/me/teams",
            );
            expect(requests[0]?.headers.get("authorization")).toBe("secret-1");
            expect(JSON.parse(result.stdout)).toEqual([
                { name: "acme", id: "team-1", role: "creator", current: true },
                { name: "beta", id: "team-2", role: "member", current: false },
            ]);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "team.list",
                    result_count_bucket: "1-5",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("team");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders accessible teams as an aligned text table", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "list"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("acme");
            expect(result.stdout).toContain("beta");
            expect(result.stdout).toContain("creator");
            expect(result.stdout).toContain("member");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports personal identity when the account has no teams", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "list"], {
                fetcher: async () => new Response(JSON.stringify({ teams: [] })),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails to list teams without an account", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requested = false;
            const result = await sandbox.run(["team", "list"], {
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify({ teams: [] }));
                },
            });

            expect(result.exitCode).toBe(1);
            expect(requested).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("shows the default team identity via current", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const jsonResult = await sandbox.run(["team", "current", "--json"]);
            const textResult = await sandbox.run(["team", "current"]);

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: "acme",
                teamId: null,
                source: "account",
                status: null,
            });
            expect(textResult.stdout).toContain("acme");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports personal identity via current when no default is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const jsonResult = await sandbox.run(["team", "current", "--json"]);
            const textResult = await sandbox.run(["team", "current"]);

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
                status: null,
            });
            expect(textResult.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("sets the default team with use after checking membership", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const useResult = await sandbox.run(["team", "use", "beta"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(teamsResponse));
                },
            });
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(useResult.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            // `oo team use` holds the membership listing, so the stored
            // default carries the team id and `current` reports it offline.
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: "beta",
                teamId: "team-2",
                source: "account",
                status: null,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects use for a team the account cannot access", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "use", "ghost"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(result.exitCode).toBe(1);
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
                status: null,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("clears the default team identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const clearResult = await sandbox.run(["team", "clear"]);
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(clearResult.exitCode).toBe(0);
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
                status: null,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports already-personal when clearing with no configured team", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["team", "clear"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("resolves the OO_TEAM_ID env override to its team name via current", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "beta");
            sandbox.env.OO_TEAM_ID = "team-1";

            const requests: Request[] = [];
            const respondWithTeam = createTeamLookupFetcher(requests);
            const jsonResult = await sandbox.run(["team", "current", "--json"], {
                fetcher: respondWithTeam,
            });
            const textResult = await sandbox.run(["team", "current"], {
                fetcher: respondWithTeam,
            });
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "team.current");

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: "acme",
                teamId: "team-1",
                source: "env_id",
                status: "valid",
            });
            // The id is resolved through the singular team route, not by
            // pulling the whole membership listing.
            expect(requests[0]?.url).toBe(
                "https://relation-control.oomol.com/v1/teams/team-1",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
            expect(textResult.stdout).toContain("OO_TEAM_ID");
            // Both halves are shown: the name is the new information, the id is
            // what the reader put in the environment.
            expect(textResult.stdout).toContain("acme");
            expect(textResult.stdout).toContain("team-1");
            // The configured default is reported as inactive.
            expect(textResult.stdout).toContain("beta");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    has_configured_team: true,
                    team_source: "env_id",
                    team_status: "valid",
                },
            });
            // Only the source and status enums are reported: neither the
            // env-selected id nor either team name reaches telemetry.
            expectTelemetryFreeOfTeamIdentity(
                telemetryPayload?.properties,
                ["team-1", "acme", "beta"],
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // Each backend answer means a different fix, so `current` must keep them
    // apart instead of collapsing them into a bare unresolved id.
    test.each([
        { httpStatus: 403, status: "not_a_member" },
        { httpStatus: 404, status: "not_found" },
        { httpStatus: 410, status: "deleted" },
        { httpStatus: 500, status: "request_failed" },
    ])(
        "reports OO_TEAM_ID lookup status $status for HTTP $httpStatus via current",
        async ({ httpStatus, status }) => {
            const sandbox = await createCliSandbox();

            try {
                await writeAuthFile(sandbox);
                sandbox.env.OO_TEAM_ID = "team-1";

                const respond = async (): Promise<Response> =>
                    new Response("{}", { status: httpStatus });
                const jsonResult = await sandbox.run(["team", "current", "--json"], {
                    fetcher: respond,
                });
                const textResult = await sandbox.run(["team", "current"], {
                    fetcher: respond,
                });

                // A failed lookup is a diagnostic, never a command failure.
                expect(jsonResult.exitCode).toBe(0);
                expect(textResult.exitCode).toBe(0);
                expect(JSON.parse(jsonResult.stdout)).toEqual({
                    team: null,
                    teamId: "team-1",
                    source: "env_id",
                    status,
                });
                // The id still prints, so the reader can see what was tried.
                expect(textResult.stdout).toContain("team-1");
            }
            finally {
                await sandbox.cleanup();
            }
        },
    );

    test("skips the OO_TEAM_ID name lookup when no account is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.OO_TEAM_ID = "team-1";

            let requested = false;
            const fetcher = async (): Promise<Response> => {
                requested = true;

                return new Response("{}", { status: 200 });
            };
            const jsonResult = await sandbox.run(["team", "current", "--json"], {
                fetcher,
            });
            const textResult = await sandbox.run(["team", "current"], { fetcher });

            // Reading the local default must not start requiring a login.
            expect(jsonResult.exitCode).toBe(0);
            expect(textResult.exitCode).toBe(0);
            expect(requested).toBe(false);
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: null,
                teamId: "team-1",
                source: "env_id",
                status: "no_credential",
            });
            expect(textResult.stdout).toContain("team-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("resolves the OO_TEAM_NAME env override to its id via current", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");
            sandbox.env.OO_TEAM_NAME = "beta";

            const requests: Request[] = [];
            const fetcher = async (
                input: Parameters<Fetcher>[0],
                init: Parameters<Fetcher>[1],
            ): Promise<Response> => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify(teamsResponse));
            };
            const jsonResult = await sandbox.run(["team", "current", "--json"], {
                fetcher,
            });
            const textResult = await sandbox.run(["team", "current"], { fetcher });
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "team.current");

            expect(jsonResult.exitCode).toBe(0);
            // The name is completed and validated through the memberships, the
            // same lookup connector commands gate on, so what current reports
            // is what a run would use.
            expect(JSON.parse(jsonResult.stdout)).toEqual({
                team: "beta",
                teamId: "team-2",
                source: "env_name",
                status: "valid",
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.com/v1/me/teams",
                "https://relation-control.oomol.com/v1/me/teams",
            ]);
            expect(textResult.stdout).toContain("OO_TEAM_NAME");
            expect(textResult.stdout).toContain("beta (team-2)");
            // The ignored config default is reported alongside.
            expect(textResult.stdout).toContain("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    has_configured_team: true,
                    team_source: "env_name",
                    team_status: "valid",
                },
            });
            expectTelemetryFreeOfTeamIdentity(
                telemetryPayload?.properties,
                ["beta", "acme"],
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("marks the env-selected team as current in the listing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");
            sandbox.env.OO_TEAM_ID = "team-2";

            const result = await sandbox.run(["team", "list", "--json"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });

            expect(result.exitCode).toBe(0);
            // The env override outranks the configured default, so the marker
            // follows the id from OO_TEAM_ID instead of the `acme` name.
            expect(JSON.parse(result.stdout)).toEqual([
                { name: "acme", id: "team-1", role: "creator", current: false },
                { name: "beta", id: "team-2", role: "member", current: true },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("hints that the env override still outranks a newly set default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            sandbox.env.OO_TEAM_NAME = "acme";

            const result = await sandbox.run(["team", "use", "beta"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Set the default team identity to beta.");
            expect(result.stdout).toContain("OO_TEAM_NAME");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("hints that the env override still selects a team after clearing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");
            sandbox.env.OO_TEAM_ID = "team-1";

            const clearResult = await sandbox.run(["team", "clear"]);
            const repeatResult = await sandbox.run(["team", "clear"]);

            expect(clearResult.exitCode).toBe(0);
            expect(clearResult.stdout).toContain("OO_TEAM_ID");
            // The saved default is gone, but the env override still selects a
            // team, so the output must not claim connector commands now run
            // personally — it reports the override instead.
            expect(clearResult.stdout).toContain("Cleared the default team identity");
            expect(clearResult.stdout).not.toContain(
                "connector commands now run under your personal identity",
            );
            // The follow-up clear has nothing to remove but still points at
            // the env override instead of promising a personal identity.
            expect(repeatResult.exitCode).toBe(0);
            expect(repeatResult.stdout).toContain("OO_TEAM_ID");
            expect(repeatResult.stdout).not.toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("backfills the team id of a default that only has a name", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const listResult = await sandbox.run(["team", "list"], {
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            });
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(listResult.exitCode).toBe(0);
            // Listing already fetched the memberships, so the stored default
            // gains its id without any extra request.
            expect(JSON.parse(currentResult.stdout)).toMatchObject({
                team: "acme",
                teamId: "team-1",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("refuses to save a default team under OO_API_KEY", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            await writeAuthFile(sandbox);

            let requested = false;
            const useResult = await sandbox.run(["team", "use", "beta"], {
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify(teamsResponse));
                },
            });
            const authContent = await readAuthFileContent(sandbox);

            expect(useResult.exitCode).toBe(0);
            expect(useResult.stdout).toContain("OO_API_KEY");
            // No membership request and no write: there is no account under
            // OO_API_KEY that could hold the default.
            expect(requested).toBe(false);
            expect(authContent).not.toContain("\nteam = ");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports that clearing does nothing under OO_API_KEY", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const result = await sandbox.run(["team", "clear"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("OO_API_KEY");
            // The saved account keeps its default; it simply does not apply
            // while OO_API_KEY supplies the credential.
            expect(await readAuthFileContent(sandbox)).toContain("team = \"acme\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("legacy default team migration", () => {
    test("moves the legacy setting onto the account on any command", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await writeLegacySettingsTeam(sandbox, "acme");

            // A command with nothing to do with identity still migrates,
            // because the migration runs in the bootstrap.
            const versionResult = await sandbox.run(["--version"]);
            const currentResult = await sandbox.run(["team", "current", "--json"]);

            expect(versionResult.exitCode).toBe(0);
            expect(await readAuthFileContent(sandbox)).toContain("team = \"acme\"");
            expect(await readSettingsFileContent(sandbox)).not.toContain(
                "\nteam = ",
            );
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: "acme",
                teamId: null,
                source: "account",
                status: null,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps honouring the legacy setting while no account can hold it", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeLegacySettingsTeam(sandbox, "acme");

            const currentResult = await sandbox.run(["team", "current", "--json"]);

            // Nothing to migrate onto, so the value stays put and still
            // resolves rather than silently becoming a personal identity.
            expect(await readSettingsFileContent(sandbox)).toContain(
                "team = \"acme\"",
            );
            expect(JSON.parse(currentResult.stdout)).toMatchObject({
                team: "acme",
                source: "account",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("leaves the legacy setting alone under OO_API_KEY", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            await writeAuthFile(sandbox);
            await writeLegacySettingsTeam(sandbox, "acme");

            const currentResult = await sandbox.run(["team", "current", "--json"]);

            // OO_API_KEY runs as a personal identity, and the untouched value
            // still applies the moment the variable is unset.
            expect(JSON.parse(currentResult.stdout)).toEqual({
                team: null,
                teamId: null,
                source: null,
                status: null,
            });
            expect(await readSettingsFileContent(sandbox)).toContain(
                "team = \"acme\"",
            );
            expect(await readAuthFileContent(sandbox)).not.toContain("\nteam = ");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("survives an unrelated settings write before migrating", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            await writeAuthFile(sandbox);
            await writeLegacySettingsTeam(sandbox, "acme");

            // Under OO_API_KEY the migration is skipped, so this write is the
            // one that would otherwise erase a value nothing has moved yet.
            const configResult = await sandbox.run(["config", "set", "lang", "zh"]);

            expect(configResult.exitCode).toBe(0);
            expect(await readSettingsFileContent(sandbox)).toContain(
                "team = \"acme\"",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

// Writes a settings.toml carrying the retired global default team, the state
// an installation that predates the account-scoped default starts from.
async function writeLegacySettingsTeam(
    sandbox: CliSandbox,
    team: string,
): Promise<void> {
    await Bun.write(
        resolveStoreFilePath(sandbox, "settings.toml"),
        `[identity]\nteam = "${team}"\n`,
    );
}

async function readAuthFileContent(sandbox: CliSandbox): Promise<string> {
    return await Bun.file(resolveStoreFilePath(sandbox, "auth.toml")).text();
}

async function readSettingsFileContent(sandbox: CliSandbox): Promise<string> {
    return await Bun.file(resolveStoreFilePath(sandbox, "settings.toml")).text();
}

function resolveStoreFilePath(sandbox: CliSandbox, fileName: string): string {
    return join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, fileName);
}

// Answers the singular team route with the first fixture team and records what
// was asked, so a test can assert both the resolved name and the route used.
function createTeamLookupFetcher(requests: Request[]): Fetcher {
    return async (input, init) => {
        requests.push(toRequest(input, init));

        return new Response(JSON.stringify(teamsResponse.teams[0]));
    };
}
