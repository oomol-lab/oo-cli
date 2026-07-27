import type { Cache } from "../../contracts/cache.ts";
import type { CliExecutionContext } from "../../contracts/cli.ts";

import type {
    ConnectorActionDefinition,
    ConnectorActionMetadata,
} from "./shared.ts";
import type { ConnectorRequestTarget } from "./target.ts";
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

declare const connectorSchemaCacheScopeBrand: unique symbol;

/**
 * The account+endpoint dimension of the action schema cache key, opaque to
 * everyone but this module: targets carry it, callers pass it through, and
 * only the schema cache creates the brand and decomposes the encoding. This
 * is what keeps cache-key fields from being misread as live URLs.
 */
export type ConnectorSchemaCacheScope = string & {
    readonly [connectorSchemaCacheScopeBrand]: "ConnectorSchemaCacheScope";
};

export function createConnectorSchemaCacheScope(dimensions: {
    accountId: string;
    endpoint: string;
}): ConnectorSchemaCacheScope {
    return JSON.stringify({
        accountId: dimensions.accountId,
        endpoint: dimensions.endpoint,
    }) as ConnectorSchemaCacheScope;
}

// What the schema loader needs from a connector target: the wire fields for
// the metadata fetch on a cache miss, plus the cache scope.
export interface ConnectorSchemaRequestTarget extends ConnectorRequestTarget {
    cacheScope: ConnectorSchemaCacheScope;
}

interface ConnectorActionSchemaIdentity {
    actionName: string;
    cacheScope: ConnectorSchemaCacheScope;
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
        actionName: string;
        refresh?: boolean;
        /**
         * Treat cached entries without an `asyncLifecycle` as cache misses so
         * the loader falls back to the metadata API. Search-seeded cache
         * entries never carry the async lifecycle, so callers that depend on
         * it (the `--wait` / `--wait-result` run modes) must not trust a
         * cached entry that lacks one.
         */
        requireAsyncLifecycle?: boolean;
        serviceName: string;
        target: ConnectorSchemaRequestTarget;
    },
    context: ConnectorActionSchemaLoaderContext,
): Promise<ConnectorActionMetadata> {
    await cleanupLegacyConnectorActionSchemaCache(context);

    const cache = openConnectorActionSchemaCache(context);
    const cacheKey = createConnectorActionSchemaCacheKey({
        actionName: options.actionName,
        cacheScope: options.target.cacheScope,
        serviceName: options.serviceName,
    });

    if (options.refresh !== true) {
        const cached = tryReadConnectorActionSchemaCache(cache, cacheKey, context);

        if (cached !== undefined) {
            if (options.requireAsyncLifecycle !== true
                || cached.asyncLifecycle !== undefined) {
                return cached;
            }

            context.logger.debug(
                {
                    actionName: options.actionName,
                    cacheScope: options.target.cacheScope,
                    serviceName: options.serviceName,
                },
                "Connector action schema cache entry lacks an async lifecycle; fetching metadata.",
            );
        }
    }
    else {
        context.logger.debug(
            {
                actionName: options.actionName,
                cacheScope: options.target.cacheScope,
                serviceName: options.serviceName,
            },
            "Connector action schema cache bypassed for refresh.",
        );
    }

    try {
        const metadata = await getConnectorActionMetadata(
            {
                actionName: options.actionName,
                serviceName: options.serviceName,
                target: options.target,
            },
            context,
        );

        cache.set(cacheKey, metadata);
        context.logger.debug(
            {
                actionName: options.actionName,
                cacheScope: options.target.cacheScope,
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
 * Bulk cache populator used to warm the connector action schema cache from
 * connector search responses (which carry `inputSchema` / `outputSchema` but
 * never an `asyncLifecycle`). `loadConnectorActionSchema` still fills the
 * cache lazily from the metadata API for anything search did not cover.
 */
export async function cacheConnectorActionSchemas(
    actions: readonly ConnectorActionDefinition[],
    cacheScope: ConnectorSchemaCacheScope,
    context: ConnectorActionSchemaCacheContext,
): Promise<void> {
    await cleanupLegacyConnectorActionSchemaCache(context);

    const cache = openConnectorActionSchemaCache(context);

    for (const action of actions) {
        cache.set(
            createConnectorActionSchemaCacheKey({
                actionName: action.name,
                cacheScope,
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
        scope: identity.cacheScope,
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
