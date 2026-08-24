import type {
    CliCommandContext,
    CliCommandDefinition,
    CompletionProvider,
} from "../contracts/cli.ts";
import type { AuthAccount } from "../schemas/auth.ts";

import { z } from "zod";
import { buildEnvApiKeyAccount, requireIdentity } from "../auth/identity.ts";
import { completionProviderValues } from "../contracts/cli.ts";
import { listMemberTeams } from "./team/shared.ts";

const teamNamesCacheId = "shell-completion-team-names-v1";
const teamNamesCacheTtlMs = 60_000;
const teamNamesCacheMaxEntries = 20;

interface InternalCompletionInput {
    prefix?: string;
    provider: CompletionProvider;
}

export const internalCompletionCommand: CliCommandDefinition<InternalCompletionInput> = {
    name: "__complete",
    excludeFromTelemetry: true,
    hidden: true,
    summaryKey: "commands.internalCompletion.summary",
    descriptionKey: "commands.internalCompletion.description",
    arguments: [
        {
            name: "provider",
            descriptionKey: "arguments.completionProvider",
            required: true,
            choices: completionProviderValues,
        },
        {
            name: "prefix",
            descriptionKey: "arguments.completionPrefix",
            required: false,
        },
    ],
    inputSchema: z.object({
        prefix: z.string().optional(),
        provider: z.enum(completionProviderValues),
    }),
    handler: async (input, context) => {
        if (buildEnvApiKeyAccount(context.env) !== undefined) {
            return;
        }

        try {
            const { account } = await requireIdentity(context);
            const names = await readTeamNames(account, context);
            const prefix = input.prefix ?? "";

            for (const name of names) {
                if (name.startsWith(prefix) && isCompletionCandidate(name)) {
                    context.stdout.write(`${name}\n`);
                }
            }
        }
        catch (error) {
            context.logger.debug(
                { err: error, provider: input.provider },
                "Shell completion candidates could not be loaded.",
            );
        }
    },
};

async function readTeamNames(
    account: AuthAccount,
    context: CliCommandContext,
): Promise<readonly string[]> {
    const cache = context.cacheStore.getCache<readonly string[]>({
        id: teamNamesCacheId,
        defaultTtlMs: teamNamesCacheTtlMs,
        maxEntries: teamNamesCacheMaxEntries,
    });
    const cacheKey = `${account.endpoint}\n${account.id}`;
    const cachedNames = cache.get(cacheKey);

    if (cachedNames !== null) {
        return cachedNames;
    }

    const teams = await listMemberTeams(account, context);
    const names = teams.map(team => team.name);

    cache.set(cacheKey, names);

    return names;
}

function isCompletionCandidate(value: string): boolean {
    for (const character of value) {
        const codePoint = character.codePointAt(0)!;

        if (
            codePoint <= 0x1F
            || (codePoint >= 0x7F && codePoint <= 0x9F)
        ) {
            return false;
        }
    }

    return true;
}
