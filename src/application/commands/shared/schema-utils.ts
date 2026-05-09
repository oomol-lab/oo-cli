export function isPlainObject<T extends object = Record<string, unknown>>(
    value: unknown,
): value is T {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

export function readWidgetName(ext: unknown): string | undefined {
    if (!isPlainObject<{ widget?: unknown }>(ext) || typeof ext.widget !== "string") {
        return undefined;
    }

    return ext.widget;
}

export const storagePathWidgets: ReadonlySet<string> = new Set(["dir", "save"]);

export function isStoragePathWidget(ext: unknown): boolean {
    const widgetName = readWidgetName(ext);

    return widgetName !== undefined && storagePathWidgets.has(widgetName);
}
