import { describe, expect, test } from "bun:test";

import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "./team-env-override.ts";

describe("readTeamEnvOverride", () => {
    test("returns undefined when neither variable is set", () => {
        expect(readTeamEnvOverride({})).toBeUndefined();
    });

    test("treats blank values as unset", () => {
        expect(readTeamEnvOverride({
            OO_TEAM_ID: "   ",
            OO_TEAM_NAME: "",
        })).toBeUndefined();
    });

    test("reads a trimmed team id", () => {
        expect(readTeamEnvOverride({ OO_TEAM_ID: " team-1 " })).toEqual({
            kind: "id",
            value: "team-1",
        });
    });

    test("reads a trimmed team name", () => {
        expect(readTeamEnvOverride({ OO_TEAM_NAME: " acme " })).toEqual({
            kind: "name",
            value: "acme",
        });
    });

    test("prefers the team id when both variables are set", () => {
        expect(readTeamEnvOverride({
            OO_TEAM_ID: "team-1",
            OO_TEAM_NAME: "acme",
        })).toEqual({
            kind: "id",
            value: "team-1",
        });
    });

    test("falls back to the name when the id is blank", () => {
        expect(readTeamEnvOverride({
            OO_TEAM_ID: "  ",
            OO_TEAM_NAME: "acme",
        })).toEqual({
            kind: "name",
            value: "acme",
        });
    });
});

describe("teamEnvOverrideVariableName", () => {
    test("names the variable that supplied the override", () => {
        expect(teamEnvOverrideVariableName({ kind: "id", value: "team-1" }))
            .toBe("OO_TEAM_ID");
        expect(teamEnvOverrideVariableName({ kind: "name", value: "acme" }))
            .toBe("OO_TEAM_NAME");
    });
});
