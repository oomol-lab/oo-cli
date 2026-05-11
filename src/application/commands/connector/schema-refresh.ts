import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { writeLine } from "../shared/output.ts";
import { clearConnectorActionSchemaCache } from "./schema-cache.ts";

export const connectorSchemaRefreshCommand: CliCommandDefinition = {
    name: "refresh",
    summaryKey: "commands.connector.schema.refresh.summary",
    descriptionKey: "commands.connector.schema.refresh.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        await clearConnectorActionSchemaCache(context);
        writeLine(
            context.stdout,
            context.translator.t("connector.schema.refresh.success"),
        );
    },
};
