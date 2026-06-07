import type { Cache } from "../../contracts/cache.ts";
import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import type {
    ConnectorActionDefinition,
    ConnectorActionMetadata,
} from "./shared.ts";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";

import {
    connectorActionMetadataSchema,
    getConnectorActionMetadata,
} from "./shared.ts";

const connectorActionSchemaCacheId = "connector-action-schema";
const connectorActionSchemaCacheTtlMs = 60 * 60 * 1000;
const connectorActionSchemaCacheMaxEntries = 1000;
const legacyConnectorActionSchemaCacheDirectoryName = "connector-actions";

interface ConnectorActionSchemaIdentity {
    accountId: string;
    actionName: string;
    endpoint: string;
    serviceName: string;
}

type ConnectorActionSchemaCacheContext = Pick<
    CliExecutionContext,
    "cacheStore" | "logger" | "settingsStore"
>;

type ConnectorActionSchemaLoaderContext = Pick<
    CliExecutionContext,
    "cacheStore" | "fetcher" | "logger" | "settingsStore" | "translator"
>;

export interface ConnectorActionSchemaOutput {
    description: string;
    inputSchema: unknown;
    name: string;
    outputSchema: unknown;
    service: string;
}

export async function loadConnectorActionSchema(
    options: {
        account: Pick<AuthAccount, "apiKey" | "endpoint" | "id">;
        actionName: string;
        refresh?: boolean;
        serviceName: string;
    },
    context: ConnectorActionSchemaLoaderContext,
): Promise<ConnectorActionMetadata> {
    await cleanupLegacyConnectorActionSchemaCache(context);

    const cache = openConnectorActionSchemaCache(context);
    const cacheKey = createConnectorActionSchemaCacheKey({
        accountId: options.account.id,
        actionName: options.actionName,
        endpoint: options.account.endpoint,
        serviceName: options.serviceName,
    });

    if (options.refresh !== true) {
        const cached = tryReadConnectorActionSchemaCache(cache, cacheKey, context);

        if (cached !== undefined) {
            return cached;
        }
    }
    else {
        context.logger.debug(
            {
                accountId: options.account.id,
                actionName: options.actionName,
                endpoint: options.account.endpoint,
                serviceName: options.serviceName,
            },
            "Connector action schema cache bypassed for refresh.",
        );
    }

    try {
        const metadata = await getConnectorActionMetadata(
            {
                actionName: options.actionName,
                apiKey: options.account.apiKey,
                endpoint: options.account.endpoint,
                serviceName: options.serviceName,
            },
            context,
        );

        cache.set(cacheKey, metadata);
        context.logger.debug(
            {
                accountId: options.account.id,
                actionName: options.actionName,
                endpoint: options.account.endpoint,
                serviceName: options.serviceName,
            },
            "Connector action schema response cached.",
        );

        return metadata;
    }
    catch (error) {
        if (isConnectorActionSchemaNotFoundError(error)) {
            cache.delete(cacheKey);
        }

        throw error;
    }
}

/**
 * Test-only bulk cache populator. Production fills the connector action schema
 * cache lazily through `loadConnectorActionSchema`; this helper is only used by
 * tests to seed cache state up front.
 *
 * @public
 */
export async function cacheConnectorActionSchemas(
    actions: readonly ConnectorActionDefinition[],
    account: Pick<AuthAccount, "endpoint" | "id">,
    context: ConnectorActionSchemaCacheContext,
): Promise<void> {
    await cleanupLegacyConnectorActionSchemaCache(context);

    const cache = openConnectorActionSchemaCache(context);

    for (const action of actions) {
        cache.set(
            createConnectorActionSchemaCacheKey({
                accountId: account.id,
                actionName: action.name,
                endpoint: account.endpoint,
                serviceName: action.service,
            }),
            connectorActionMetadataSchema.parse(action),
        );
    }
}

export async function clearConnectorActionSchemaCache(
    context: ConnectorActionSchemaCacheContext,
): Promise<void> {
    await cleanupLegacyConnectorActionSchemaCache(context);
    openConnectorActionSchemaCache(context).clear();
}

export function deleteConnectorActionSchemaCache(
    identity: ConnectorActionSchemaIdentity,
    context: Pick<CliExecutionContext, "cacheStore">,
): boolean {
    return openConnectorActionSchemaCache(context).delete(
        createConnectorActionSchemaCacheKey(identity),
    );
}

export function createConnectorActionSchemaOutput(
    schema: ConnectorActionMetadata,
): ConnectorActionSchemaOutput {
    const output: ConnectorActionSchemaOutput = {
        description: schema.description,
        inputSchema: schema.inputSchema,
        name: schema.name,
        outputSchema: schema.outputSchema,
        service: schema.service,
    };

    return output;
}

export function createConnectorActionSchemaCacheKey(
    identity: ConnectorActionSchemaIdentity,
): string {
    return JSON.stringify({
        accountId: identity.accountId,
        endpoint: identity.endpoint,
        serviceName: identity.serviceName,
        actionName: identity.actionName,
    });
}

export function isConnectorActionSchemaNotFoundError(error: unknown): boolean {
    if (!(error instanceof CliUserError)) {
        return false;
    }

    if (error.params?.status === 404) {
        return true;
    }

    return error.params?.errorCode === "action_not_found";
}

// Tracks settings paths whose legacy on-disk cache directory has already been
// cleaned in the current process so we issue at most one rm per CLI invocation.
const legacyConnectorActionSchemaCacheCleanedPaths = new Set<string>();

async function cleanupLegacyConnectorActionSchemaCache(
    context: Pick<CliExecutionContext, "logger" | "settingsStore">,
): Promise<void> {
    const settingsFilePath = context.settingsStore.getFilePath();

    if (settingsFilePath === "") {
        return;
    }

    if (legacyConnectorActionSchemaCacheCleanedPaths.has(settingsFilePath)) {
        return;
    }

    legacyConnectorActionSchemaCacheCleanedPaths.add(settingsFilePath);

    const directoryPath = join(
        dirname(settingsFilePath),
        legacyConnectorActionSchemaCacheDirectoryName,
    );

    try {
        await rm(directoryPath, { force: true, recursive: true });
    }
    catch (error) {
        context.logger.warn(
            {
                err: error,
                path: directoryPath,
            },
            "Legacy connector action schema cache cleanup failed.",
        );
    }
}

function openConnectorActionSchemaCache(
    context: Pick<CliExecutionContext, "cacheStore">,
) {
    return context.cacheStore.getCache<ConnectorActionMetadata>({
        defaultTtlMs: connectorActionSchemaCacheTtlMs,
        id: connectorActionSchemaCacheId,
        maxEntries: connectorActionSchemaCacheMaxEntries,
    });
}

function tryReadConnectorActionSchemaCache(
    cache: Cache<ConnectorActionMetadata>,
    cacheKey: string,
    context: Pick<CliExecutionContext, "logger">,
): ConnectorActionMetadata | undefined {
    const cached = cache.get(cacheKey);

    if (cached === null) {
        return undefined;
    }

    try {
        return connectorActionMetadataSchema.parse(cached);
    }
    catch (error) {
        const deleted = cache.delete(cacheKey);

        context.logger.warn(
            {
                deleted,
                err: error,
            },
            "Connector action schema cache entry was invalidated after a parse failure.",
        );

        return undefined;
    }
}
