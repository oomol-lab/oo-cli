export const CONNECTOR_CATALOG_URL = "https://connector.oomol.com/v1/catalog";
export const SEARCH_COUNT_URL = "https://search.oomol.com/v1/count";

export async function fetchCatalogStats(fetcher = globalThis.fetch) {
    const [catalogStats, searchCountStats] = await Promise.all([
        fetchConnectorCatalogStats(fetcher),
        fetchSearchCountStats(fetcher),
    ]);

    if (catalogStats === undefined && searchCountStats === undefined)
        return undefined;

    return {
        ...catalogStats,
        ...searchCountStats,
    };
}

async function fetchConnectorCatalogStats(fetcher) {
    try {
        const response = await fetcher(CONNECTOR_CATALOG_URL, {
            headers: {
                Accept: "application/json",
            },
        });
        if (!response.ok)
            return undefined;

        return parseCatalogStatsResponse(await response.json());
    }
    catch {
        return undefined;
    }
}

async function fetchSearchCountStats(fetcher) {
    try {
        const response = await fetcher(SEARCH_COUNT_URL, {
            headers: {
                Accept: "application/json",
            },
        });
        if (!response.ok)
            return undefined;

        return parseSearchCountResponse(await response.json());
    }
    catch {
        return undefined;
    }
}

export function parseCatalogStatsResponse(payload) {
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data))
        return undefined;

    const { actionCount, providerCount } = payload.data;
    if (!isNonNegativeSafeInteger(actionCount) || !isNonNegativeSafeInteger(providerCount))
        return undefined;

    return {
        actionCount,
        providerCount,
    };
}

export function parseSearchCountResponse(payload) {
    if (!isRecord(payload))
        return undefined;

    const { blockCount } = payload;
    if (!isNonNegativeSafeInteger(blockCount))
        return undefined;

    return {
        blockCount,
    };
}

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
