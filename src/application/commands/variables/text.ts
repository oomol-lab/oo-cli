import type { Variable } from "./shared.ts";

// The list text view shows only name and updatedAt; the full value is exposed
// via `get` or `--json`, to avoid flushing tokens / secret-like / large JSON
// values to the terminal.
export function formatVariableListLine(variable: Variable): string {
    return `${variable.name}\t${variable.updatedAt}`;
}
