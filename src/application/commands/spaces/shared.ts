import type { CliArgumentDefinition, CliOptionDefinition, Writer } from "../../contracts/cli.ts";

import { z } from "zod";
import { teamIdentityInputShape, teamOption } from "../team/identity.ts";

// What every `oo spaces` command shares: the team selection, and for the
// commands that act on one space its positional id or slug.

export const teamOptions: readonly CliOptionDefinition[] = [teamOption("options.variablesTeam")];
export const teamInput = z.object({ ...teamIdentityInputShape });
export const spaceInput = teamInput.extend({ space: z.string().min(1) });
export const spaceArgument: CliArgumentDefinition = {
    name: "space",
    descriptionKey: "arguments.spaces.space",
    required: true,
};
export const yesOption: CliOptionDefinition = {
    name: "yes",
    longFlag: "--yes",
    shortFlag: "-y",
    descriptionKey: "options.spaces.yes",
};

/** Unix seconds as an ISO timestamp, or a dash when the time is not set. */
export function formatTime(seconds: number | null): string {
    return seconds === null ? "-" : new Date(seconds * 1_000).toISOString().replace(".000Z", "Z");
}

export function orDash(value: number | string | null | undefined): string {
    return value === null || value === undefined || value === "" ? "-" : String(value);
}

// A titled list of labelled values, the detail view of one resource.
export function writeFields(writer: Writer, title: string, fields: readonly (readonly [string, string])[]): void {
    writer.write(`${title}\n${fields.map(([label, value]) => `  - ${label}: ${value}\n`).join("")}`);
}
