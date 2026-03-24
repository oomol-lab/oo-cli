import type { CliCommandDefinition } from "../contracts/cli.ts";

import { authLoginCommand } from "./auth/login.ts";

export const loginCommand: CliCommandDefinition = {
    ...authLoginCommand,
    summaryKey: "commands.login.summary",
    descriptionKey: "commands.login.description",
};
