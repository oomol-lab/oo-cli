import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { AuthAccount, AuthFile } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { getNextAuthAccount, setCurrentAuthId } from "../../schemas/auth.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import {
    formatAuthStrong,
    writeAuthBlock,
} from "./shared.ts";

interface AuthSwitchInput {
    user?: string;
}

type SwitchMatchKind = "ambiguous" | "id" | "name" | "next" | "not_found";

export const authSwitchCommand: CliCommandDefinition<AuthSwitchInput> = {
    name: "switch",
    summaryKey: "commands.auth.switch.summary",
    descriptionKey: "commands.auth.switch.description",
    options: [
        {
            name: "user",
            longFlag: "--user",
            shortFlag: "-u",
            valueName: "user",
            descriptionKey: "options.auth.switch.user",
        },
    ],
    inputSchema: z.object({
        user: z.string().trim().min(1).optional(),
    }),
    handler: async (input, context) => {
        const authFile = await context.authStore.read();

        context.telemetry?.recordProperties({
            account_count_bucket: bucketTelemetryCount(authFile.auth.length),
            has_user_filter: input.user !== undefined,
        });

        if (authFile.auth.length === 0) {
            throw new CliUserError("errors.auth.noSavedAccounts", 1);
        }

        const { account, matchKind } = input.user === undefined
            ? { account: getNextAuthAccount(authFile)!, matchKind: "next" as SwitchMatchKind }
            : resolveAccountByUser(authFile, input.user);

        await context.authStore.write(setCurrentAuthId(authFile, account.id));
        context.logger.info(
            {
                endpoint: account.endpoint,
                matchKind,
                nextAccountId: account.id,
                previousCurrentAuthId: authFile.id,
            },
            "Active auth account switched.",
        );
        writeAuthBlock(context, {
            tone: "success",
            summary: context.translator.t("auth.switch.success", {
                endpoint: account.endpoint,
                name: formatAuthStrong(context, account.name),
            }),
        });
    },
};

interface ResolvedUser {
    account: AuthAccount;
    matchKind: SwitchMatchKind;
}

function resolveAccountByUser(authFile: AuthFile, user: string): ResolvedUser {
    const byId = authFile.auth.find(account => account.id === user);

    if (byId !== undefined) {
        return { account: byId, matchKind: "id" };
    }

    const byName = authFile.auth.filter(account => account.name === user);

    if (byName.length === 1) {
        return { account: byName[0]!, matchKind: "name" };
    }

    if (byName.length > 1) {
        throw new CliUserError("errors.auth.switch.userAmbiguous", 1, {
            value: user,
        });
    }

    throw new CliUserError("errors.auth.switch.userNotFound", 1, {
        value: user,
    });
}
