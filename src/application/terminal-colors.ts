import type { Writer } from "./contracts/cli.ts";

const colorResetCode = "\u001B[39m";
const stringFormatter = String as TerminalFormatter;

interface TerminalFormatterDefinition {
    close: string;
    open: string;
    replace?: string;
}

const formatterDefinitions = {
    reset: {
        close: "\u001B[0m",
        open: "\u001B[0m",
    },
    bold: {
        close: "\u001B[22m",
        open: "\u001B[1m",
        replace: "\u001B[22m\u001B[1m",
    },
    dim: {
        close: "\u001B[22m",
        open: "\u001B[2m",
        replace: "\u001B[22m\u001B[2m",
    },
    strikethrough: {
        close: "\u001B[29m",
        open: "\u001B[9m",
    },
    red: {
        close: colorResetCode,
        open: "\u001B[31m",
    },
    green: {
        close: colorResetCode,
        open: "\u001B[32m",
    },
    yellow: {
        close: colorResetCode,
        open: "\u001B[33m",
    },
    blue: {
        close: colorResetCode,
        open: "\u001B[34m",
    },
    magenta: {
        close: colorResetCode,
        open: "\u001B[35m",
    },
    cyan: {
        close: colorResetCode,
        open: "\u001B[36m",
    },
    gray: {
        close: colorResetCode,
        open: "\u001B[90m",
    },
} as const satisfies Record<string, TerminalFormatterDefinition>;

type TerminalFormatterName = keyof typeof formatterDefinitions;

export type TerminalInput = string | number | null | undefined;

export type TerminalFormatter = (value: TerminalInput) => string;

export type TerminalColors = Record<TerminalFormatterName, TerminalFormatter> & {
    isColorSupported: boolean;
    hex: (color: string) => TerminalFormatter;
    strip: (value: string) => string;
};

export function createTerminalColors(enabled: boolean): TerminalColors {
    return {
        ...createNamedFormatters(enabled),
        isColorSupported: enabled,
        hex: color => createHexFormatter(enabled, color),
        strip: value => Bun.stripANSI(value),
    };
}

export function createWriterColors(
    writer: Pick<Writer, "hasColors">,
): TerminalColors {
    return createTerminalColors(writer.hasColors?.() ?? false);
}

function createNamedFormatters(
    enabled: boolean,
): Record<TerminalFormatterName, TerminalFormatter> {
    return Object.fromEntries(
        (Object.entries(formatterDefinitions) as [TerminalFormatterName, TerminalFormatterDefinition][])
            .map(([name, definition]) => [name, createFormatter(enabled, definition)]),
    ) as Record<TerminalFormatterName, TerminalFormatter>;
}

function createHexFormatter(
    enabled: boolean,
    color: string,
): TerminalFormatter {
    if (!enabled) {
        return stringFormatter;
    }

    const open = Bun.color(color, "ansi-16m");

    if (typeof open !== "string" || open === "") {
        return stringFormatter;
    }

    return createFormatter(enabled, {
        close: colorResetCode,
        open,
    });
}

function createFormatter(
    enabled: boolean,
    definition: TerminalFormatterDefinition,
): TerminalFormatter {
    if (!enabled) {
        return stringFormatter;
    }

    const replace = definition.replace ?? definition.open;

    return (value) => {
        const stringValue = String(value);
        const closeIndex = stringValue.indexOf(
            definition.close,
            definition.open.length,
        );

        if (closeIndex === -1) {
            return `${definition.open}${stringValue}${definition.close}`;
        }

        return `${definition.open}${replaceClose(
            stringValue,
            definition.close,
            replace,
            closeIndex,
        )}${definition.close}`;
    };
}

function replaceClose(
    value: string,
    close: string,
    replace: string,
    index: number,
): string {
    let result = "";
    let cursor = 0;
    let currentIndex = index;

    while (currentIndex !== -1) {
        result += value.slice(cursor, currentIndex) + replace;
        cursor = currentIndex + close.length;
        currentIndex = value.indexOf(close, cursor);
    }

    return result + value.slice(cursor);
}
