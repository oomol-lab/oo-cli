import { CliUserError } from "../../contracts/cli.ts";

export function parseEnumOption<T extends string>(
    value: string | undefined,
    allowedValues: readonly T[],
    errorKey: string,
): T | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (allowedValues.includes(value as T)) {
        return value as T;
    }

    throw new CliUserError(errorKey, 2, { value });
}

export function parsePositiveIntegerOption(
    value: string | undefined,
    errorKey: string,
    options: {
        max?: number;
        min?: number;
        optionName: string;
    },
): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        throw new CliUserError(errorKey, 2, {
            option: options.optionName,
            value,
        });
    }

    const parsedValue = Number(trimmedValue);

    if (
        !Number.isInteger(parsedValue)
        || parsedValue < (options.min ?? 1)
        || (options.max !== undefined && parsedValue > options.max)
    ) {
        throw new CliUserError(errorKey, 2, {
            option: options.optionName,
            value,
        });
    }

    return parsedValue;
}

export function createFormatInputError(
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.shared.invalidFormat", 2, {
        value: String(rawInput.format ?? ""),
    });
}
