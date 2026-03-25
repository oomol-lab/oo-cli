import type { LogCategory } from "./log-categories.ts";

export function withAccountIdentity(
    accountId: string,
    endpoint: string,
): {
    accountId: string;
    endpoint: string;
} {
    return {
        accountId,
        endpoint,
    };
}

export function withAccountId(accountId: string): {
    accountId: string;
} {
    return { accountId };
}

export function withCacheId(cacheId: string): {
    cacheId: string;
} {
    return { cacheId };
}

export function withCategory(category: LogCategory): {
    category: LogCategory;
} {
    return { category };
}

export function withErrorKey(key: string): {
    key: string;
} {
    return { key };
}

export function withKeyFingerprint(keyFingerprint: string): {
    keyFingerprint: string;
} {
    return { keyFingerprint };
}

export function withPackageIdentity(
    packageName: string,
    packageVersion?: string,
): {
    packageName: string;
    packageVersion?: string;
} {
    return packageVersion === undefined
        ? { packageName }
        : {
                packageName,
                packageVersion,
            };
}

export function withPath(path: string): {
    path: string;
} {
    return { path };
}

export function withRequestTarget(
    endpoint: string,
    path: string,
): {
    endpoint: string;
    path: string;
} {
    return {
        endpoint,
        path,
    };
}

export function withStorePath(path: string): {
    path: string;
} {
    return withPath(path);
}
