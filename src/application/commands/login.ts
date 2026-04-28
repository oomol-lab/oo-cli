import type { CliCommandDefinition } from "../contracts/cli.ts";

import type { AuthLoginCommandInput } from "./auth/login.ts";
import { authLoginCommand } from "./auth/login.ts";

export const loginCommand: CliCommandDefinition<AuthLoginCommandInput> = {
    ...authLoginCommand,
    summaryKey: "commands.login.summary",
    descriptionKey: "commands.login.description",
};
