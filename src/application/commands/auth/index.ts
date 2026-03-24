import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { authLoginCommand } from "./login.ts";
import { authLogoutCommand } from "./logout.ts";
import { authStatusCommand } from "./status.ts";
import { authSwitchCommand } from "./switch.ts";

export const authCommand: CliCommandDefinition = {
    name: "auth",
    summaryKey: "commands.auth.summary",
    descriptionKey: "commands.auth.description",
    children: [
        authLoginCommand,
        authLogoutCommand,
        authStatusCommand,
        authSwitchCommand,
    ],
};
