const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["", "0", "false", "no", "off"]);

export function readEnvBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (truthyValues.has(normalized)) {
        return true;
    }

    if (falsyValues.has(normalized)) {
        return false;
    }

    return undefined;
}
