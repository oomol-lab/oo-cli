import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { ConnectorFile } from "../../schemas/connector.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { sanitizeUrlForLogging } from "../../logging/url-sanitizer.ts";
import { getSelfHostedConnectorConfig } from "../../schemas/connector.ts";
import { writeLine } from "../shared/output.ts";

export const connectorLogoutCommand: CliCommandDefinition = {
    name: "logout",
    summaryKey: "commands.connector.logout.summary",
    descriptionKey: "commands.connector.logout.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const connectorFile = await readConnectorFileForLogout(context);

        // A broken connector.toml is handled by clearing it: logout is the
        // repair path, so corruption must not make the config unremovable.
        if (connectorFile === undefined) {
            await context.connectorStore.write({});
            writeLine(
                context.stdout,
                context.translator.t("connector.logout.cleared"),
            );
            return;
        }

        const selfHosted = getSelfHostedConnectorConfig(connectorFile);

        if (selfHosted === undefined) {
            writeLine(
                context.stdout,
                context.translator.t("connector.logout.notConfigured"),
            );
            return;
        }

        await context.connectorStore.update(({
            selfHosted: _removed,
            ...rest
        }) => rest);

        // The stored value is normalized at login, but a hand-edited file can
        // carry query values or userinfo — sanitize before logging or printing.
        const sanitizedUrl = sanitizeUrlForLogging(selfHosted.url);

        context.logger.info(
            {
                url: sanitizedUrl,
            },
            "Self-hosted connector configuration removed.",
        );

        writeLine(
            context.stdout,
            context.translator.t("connector.logout.success", {
                url: sanitizedUrl,
            }),
        );
    },
};

async function readConnectorFileForLogout(
    context: CliExecutionContext,
): Promise<ConnectorFile | undefined> {
    try {
        return await context.connectorStore.read();
    }
    catch (error) {
        // Only corrupt file contents make logout fall back to clearing the
        // file; a transient read failure (I/O, permissions) must propagate so
        // logout never silently wipes a connector.toml it merely failed to read.
        if (!isCorruptConnectorFileError(error)) {
            throw error;
        }

        context.logger.warn(
            {
                err: error,
            },
            "Connector store file is corrupt during logout; clearing it.",
        );

        return undefined;
    }
}

function isCorruptConnectorFileError(error: unknown): boolean {
    return error instanceof CliUserError
        && (error.key === "errors.connectorStore.invalidToml"
            || error.key === "errors.connectorStore.invalidSchema");
}
