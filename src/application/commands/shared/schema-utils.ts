export function isPlainObject<T extends object = Record<string, unknown>>(
    value: unknown,
): value is T {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}
