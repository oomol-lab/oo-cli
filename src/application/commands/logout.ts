import type { CliCommandDefinition } from "../contracts/cli.ts";

import { authLogoutCommand } from "./auth/logout.ts";

export const logoutCommand: CliCommandDefinition = {
    ...authLogoutCommand,
    summaryKey: "commands.logout.summary",
    descriptionKey: "commands.logout.description",
};
