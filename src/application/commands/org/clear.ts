import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    getConfiguredIdentityOrganization,
    unsetIdentityOrganization,
} from "../../schemas/settings.ts";
import { writeLine } from "../shared/output.ts";

// Clears the default organization identity (config `identity.organization`),
// returning connector commands to the personal identity. Offline: it only
// rewrites local settings.
export const orgClearCommand: CliCommandDefinition = {
    name: "clear",
    summaryKey: "commands.org.clear.summary",
    descriptionKey: "commands.org.clear.description",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const settings = await context.settingsStore.read();
        const hadConfiguredOrganization
            = getConfiguredIdentityOrganization(settings) !== undefined;

        if (!hadConfiguredOrganization) {
            writeLine(
                context.stdout,
                context.translator.t("org.clear.alreadyPersonal"),
            );
            return;
        }

        await context.settingsStore.update(unsetIdentityOrganization);

        context.logger.info(
            { organizationConfigured: false },
            "Default organization identity cleared.",
        );
        writeLine(context.stdout, context.translator.t("org.clear.success"));
    },
};
