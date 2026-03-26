import type { CliCatalog } from "../contracts/cli.ts";

import { APP_NAME } from "../config/app-config.ts";
import { authCommand } from "./auth/index.ts";
import { checkUpdateCommand } from "./check-update.ts";
import { cloudTaskCommand } from "./cloud-task/index.ts";
import { completionCommand } from "./completion.ts";
import { configCommand } from "./config/index.ts";
import { fileCommand } from "./file/index.ts";
import { logCommand } from "./log/index.ts";
import { loginCommand } from "./login.ts";
import { logoutCommand } from "./logout.ts";
import { packageCommand } from "./package/index.ts";
import { searchCommand } from "./search.ts";
import { skillsCommand } from "./skills/index.ts";

const globalOptions = [
    {
        name: "debug",
        longFlag: "--debug",
        descriptionKey: "options.debug",
        global: true,
    },
    {
        name: "lang",
        longFlag: "--lang",
        valueName: "lang",
        descriptionKey: "options.lang",
        global: true,
    },
] as const;

export function createCliCatalog(): CliCatalog {
    return {
        name: APP_NAME,
        descriptionKey: "app.description",
        globalOptions,
        commands: [
            authCommand,
            checkUpdateCommand,
            cloudTaskCommand,
            fileCommand,
            loginCommand,
            logoutCommand,
            completionCommand,
            configCommand,
            skillsCommand,
            logCommand,
            packageCommand,
            searchCommand,
        ],
    };
}
