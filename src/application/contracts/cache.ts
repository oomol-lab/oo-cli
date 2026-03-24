export interface CacheSetOptions {
    ttlMs?: number;
}

export interface CacheOptions {
    id: string;
    defaultTtlMs?: number;
    maxEntries?: number;
    now?: () => number;
}

export interface Cache<Value> {
    get: (key: string) => Value | null;
    set: (key: string, value: Value, options?: CacheSetOptions) => void;
    has: (key: string) => boolean;
    delete: (key: string) => boolean;
    clear: () => void;
}

export interface CacheStore {
    getFilePath: () => string;
    getCache: <Value>(options: CacheOptions) => Cache<Value>;
    close: () => void;
}
