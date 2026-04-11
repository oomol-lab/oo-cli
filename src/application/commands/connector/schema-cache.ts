import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { ConnectorActionDefinition } from "./shared.ts";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { connectorActionDefinitionSchema, getConnectorActionMetadata } from "./shared.ts";

const connectorActionSchemaCacheDirectoryName = "connector-actions";

export interface ConnectorActionSchemaReference
    extends ConnectorActionDefinition {
    schemaPath: string;
}

export async function ensureConnectorActionSchemaReference(
    options: {
        actionName: string;
        apiKey: string;
        endpoint: string;
        serviceName: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "settingsStore">,
): Promise<ConnectorActionSchemaReference> {
    const schemaPath = resolveConnectorActionSchemaPath(
        context.settingsStore.getFilePath(),
        options.serviceName,
        options.actionName,
    );
    const cachedSchema = await tryReadConnectorActionSchemaCache(
        schemaPath,
        context,
    );

    if (cachedSchema !== undefined) {
        return {
            ...cachedSchema,
            schemaPath,
        };
    }

    const metadata = await getConnectorActionMetadata(options, context);

    await writeConnectorActionSchemaCache(schemaPath, metadata);

    return {
        ...metadata,
        schemaPath,
    };
}

export async function persistConnectorActionSchemaCache(
    action: ConnectorActionDefinition,
    context: Pick<CliExecutionContext, "settingsStore">,
): Promise<string> {
    const schemaPath = resolveConnectorActionSchemaPath(
        context.settingsStore.getFilePath(),
        action.service,
        action.name,
    );

    await writeConnectorActionSchemaCache(schemaPath, action);

    return schemaPath;
}

export function renderConnectorActionSchemaCache(
    action: ConnectorActionDefinition,
): string {
    return `${JSON.stringify(action, null, 2)}\n`;
}

export function resolveConnectorActionSchemaPath(
    settingsFilePath: string,
    serviceName: string,
    actionName: string,
): string {
    return join(
        dirname(settingsFilePath),
        connectorActionSchemaCacheDirectoryName,
        encodeURIComponent(serviceName),
        `${encodeURIComponent(actionName)}.json`,
    );
}

async function tryReadConnectorActionSchemaCache(
    schemaPath: string,
    context: Pick<CliExecutionContext, "logger">,
): Promise<ConnectorActionDefinition | undefined> {
    let content: string;

    try {
        content = await readFile(schemaPath, "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw new CliUserError("errors.connectorSchema.readFailed", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: schemaPath,
        });
    }

    try {
        return connectorActionDefinitionSchema.parse(
            JSON.parse(content) as unknown,
        );
    }
    catch {
        context.logger.warn(
            {
                path: schemaPath,
            },
            "Connector action schema cache was invalid and will be refreshed.",
        );

        return undefined;
    }
}

async function writeConnectorActionSchemaCache(
    schemaPath: string,
    action: ConnectorActionDefinition,
): Promise<void> {
    try {
        await mkdir(dirname(schemaPath), { recursive: true });
        await Bun.write(schemaPath, renderConnectorActionSchemaCache(action));
    }
    catch (error) {
        throw new CliUserError("errors.connectorSchema.writeFailed", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: schemaPath,
        });
    }
}

function isNodeNotFoundError(
    error: unknown,
): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
