import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createSpacesClient, getAccess, revokeSessions, setAccess } from "./api.ts";
import { assertVisibility } from "./manage.ts";
import { spaceArgument, spaceInput, teamOptions } from "./shared.ts";

// Who can open the site at the edge. Visibility gates the front end only;
// data access is enforced by the app's own Convex functions.

const get: CliCommandDefinition<z.infer<typeof spaceInput>> = {
    name: "get",
    summaryKey: "commands.spaces.access.get.summary",
    output: "standard",
    inputSchema: spaceInput,
    arguments: [spaceArgument],
    options: teamOptions,
    handler: async (input, context) => {
        const access = await getAccess(await createSpacesClient(input, context), input.space);

        context.output.emit(access, () => context.stdout.write(`${access.visibility}\n`));
    },
};

const setInput = spaceInput.extend({ visibility: z.string().optional() });
const set: CliCommandDefinition<z.infer<typeof setInput>> = {
    name: "set",
    summaryKey: "commands.spaces.access.set.summary",
    output: "standard",
    inputSchema: setInput,
    arguments: [spaceArgument],
    options: [...teamOptions, { name: "visibility", longFlag: "--visibility", valueName: "visibility", descriptionKey: "options.spaces.visibility" }],
    handler: async (input, context) => {
        if (input.visibility === undefined) {
            throw new CliUserError("errors.spaces.visibilityRequired", 2);
        }

        assertVisibility(input.visibility);

        const access = await setAccess(await createSpacesClient(input, context), input.space, input.visibility);

        context.output.emit(access, () => context.stdout.write(`${access.visibility}\n`));
    },
};

const revoke: CliCommandDefinition<z.infer<typeof spaceInput>> = {
    name: "revoke-sessions",
    summaryKey: "commands.spaces.access.revokeSessions.summary",
    output: "standard",
    inputSchema: spaceInput,
    arguments: [spaceArgument],
    options: teamOptions,
    handler: async (input, context) => {
        await revokeSessions(await createSpacesClient(input, context), input.space);

        context.output.emit({ ok: true }, () => context.stdout.write(`${context.translator.t("spaces.text.sessionsRevoked", {
            space: input.space,
        })}\n`));
    },
};

export const accessCommand: CliCommandDefinition = {
    name: "access",
    summaryKey: "commands.spaces.access.summary",
    descriptionKey: "commands.spaces.access.description",
    children: [get, set, revoke],
};
