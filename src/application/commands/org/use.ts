import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { setIdentityOrganization } from "../../schemas/settings.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import { listMemberOrganizations } from "./shared.ts";

interface OrgUseInput {
    name: string;
}

// Sets the default organization identity (config `identity.organization`) after
// confirming the account is actually a member of it. The membership check is
// the value over a bare `oo config set identity.organization`: it rejects typos
// and stale names up front instead of surfacing them later on a connector run.
export const orgUseCommand: CliCommandDefinition<OrgUseInput> = {
    name: "use",
    summaryKey: "commands.org.use.summary",
    descriptionKey: "commands.org.use.description",
    arguments: [
        {
            name: "name",
            descriptionKey: "arguments.orgUseName",
            required: true,
        },
    ],
    inputSchema: z.object({
        name: z.string(),
    }),
    handler: async (input, context) => {
        const name = input.name.trim();

        if (name === "") {
            throw new CliUserError("errors.org.nameEmpty", 2);
        }

        const account = await requireCurrentAccount(context);
        const organizations = await listMemberOrganizations(account, context);

        if (!organizations.some(organization => organization.name === name)) {
            throw new CliUserError("errors.org.notAccessible", 1, {
                organization: name,
            });
        }

        await context.settingsStore.update(settings =>
            setIdentityOrganization(settings, name),
        );

        context.logger.info(
            { organizationConfigured: true },
            "Default organization identity persisted.",
        );
        writeLine(
            context.stdout,
            context.translator.t("org.use.success", { organization: name }),
        );
    },
};
