import type { Writer } from "./contracts/cli.ts";

const colorResetCode = "\u001B[39m";
const intensityResetCode = "\u001B[22m";
const basicColorOpenCodes = {
    blue: "\u001B[34m",
    cyan: "\u001B[36m",
    green: "\u001B[32m",
    magenta: "\u001B[35m",
    red: "\u001B[31m",
    yellow: "\u001B[33m",
} as const;
const boldStyle = {
    close: intensityResetCode,
    open: "\u001B[1m",
} as const;
const dimStyle = {
    close: intensityResetCode,
    open: "\u001B[2m",
} as const;

interface TerminalStyle {
    close: string;
    open: string;
}

export type TerminalFormatter = ((value: string) => string) & {
    bold: (value: string) => string;
    dim: (value: string) => string;
};

export interface TerminalColors {
    blue: TerminalFormatter;
    bold: (value: string) => string;
    cyan: TerminalFormatter;
    dim: (value: string) => string;
    green: TerminalFormatter;
    hex: (color: string) => TerminalFormatter;
    magenta: TerminalFormatter;
    red: TerminalFormatter;
    strip: (value: string) => string;
    yellow: TerminalFormatter;
}

export function createTerminalColors(enabled: boolean): TerminalColors {
    return {
        blue: createBasicColorFormatter(enabled, "blue"),
        bold: value => applyTerminalStyles(value, enabled, [boldStyle]),
        cyan: createBasicColorFormatter(enabled, "cyan"),
        dim: value => applyTerminalStyles(value, enabled, [dimStyle]),
        green: createBasicColorFormatter(enabled, "green"),
        hex: color => createColorFormatter(enabled, color),
        magenta: createBasicColorFormatter(enabled, "magenta"),
        red: createBasicColorFormatter(enabled, "red"),
        strip: value => Bun.stripANSI(value),
        yellow: createBasicColorFormatter(enabled, "yellow"),
    };
}

export function createWriterColors(
    writer: Pick<Writer, "hasColors">,
): TerminalColors {
    return createTerminalColors(writer.hasColors?.() ?? false);
}

function createColorFormatter(
    enabled: boolean,
    color: string,
): TerminalFormatter {
    const style = createColorStyle(color);

    if (style === null) {
        return createFormatter(enabled, []);
    }

    return createFormatter(enabled, [style]);
}

function createBasicColorFormatter(
    enabled: boolean,
    color: keyof typeof basicColorOpenCodes,
): TerminalFormatter {
    return createFormatter(enabled, [
        {
            close: colorResetCode,
            open: basicColorOpenCodes[color],
        },
    ]);
}

function createFormatter(
    enabled: boolean,
    styles: readonly TerminalStyle[],
): TerminalFormatter {
    const formatter = ((value: string) =>
        applyTerminalStyles(value, enabled, styles)) as TerminalFormatter;

    formatter.bold = (value: string) =>
        applyTerminalStyles(value, enabled, [...styles, boldStyle]);
    formatter.dim = (value: string) =>
        applyTerminalStyles(value, enabled, [...styles, dimStyle]);

    return formatter;
}

function createColorStyle(color: string): TerminalStyle | null {
    // Bun exposes ANSI conversion and stripping, but not ansis-style chaining.
    // Keep that behavior local so the rest of the CLI stays unchanged.
    const open = Bun.color(color, "ansi-16m");

    if (typeof open !== "string" || open === "") {
        return null;
    }

    return {
        close: colorResetCode,
        open,
    };
}

function applyTerminalStyles(
    value: string,
    enabled: boolean,
    styles: readonly TerminalStyle[],
): string {
    if (!enabled || styles.length === 0) {
        return value;
    }

    const openCodes = styles.map(style => style.open).join("");
    const closeCodes = styles
        .slice()
        .reverse()
        .map(style => style.close)
        .join("");

    return `${openCodes}${value}${closeCodes}`;
}
