import type { TerminalColors } from "../../terminal-colors.ts";

export interface TextTableColumn<Row> {
    header: string;
    render: (row: Row) => string;
}

/**
 * Renders rows as a color-coded, column-aligned table with a dimmed header.
 *
 * Column widths use the terminal display width, which ignores ANSI color
 * escapes and counts wide CJK/emoji glyphs as two columns, so neither color
 * codes nor multi-cell characters skew the alignment. Callers own the
 * empty-state message and their own column definitions.
 */
export function formatTextTable<Row>(
    columns: readonly TextTableColumn<Row>[],
    rows: readonly Row[],
    colors: TerminalColors,
): string {
    const headerCells = columns.map(column => colors.dim(column.header));
    const bodyRows = rows.map(row => columns.map(column => column.render(row)));
    const widths = columns.map((_, index) => Math.max(
        Bun.stringWidth(headerCells[index]!),
        ...bodyRows.map(cells => Bun.stringWidth(cells[index]!)),
    ));

    return [headerCells, ...bodyRows]
        .map(cells => joinTextTableRow(cells, widths))
        .join("\n");
}

// Pads every cell except the last to its column width (measured in display
// columns) and joins the row with a two-space gutter.
function joinTextTableRow(
    cells: readonly string[],
    widths: readonly number[],
): string {
    return cells
        .map((cell, index) => index === cells.length - 1
            ? cell
            : cell + " ".repeat(widths[index]! - Bun.stringWidth(cell)))
        .join("  ");
}
