import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";
import { runSelfInstall } from "./self-install.ts";

export const installCommand: CliCommandDefinition = {
    hidden: true,
    name: "install",
    summaryKey: "commands.install.summary",
    descriptionKey: "commands.install.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        await runSelfInstall(context);
    },
};
