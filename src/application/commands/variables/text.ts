import type { Variable } from "./shared.ts";

// list 文本视图只展示 key 与 updatedAt；完整 value 走 `get` 或 `--json`，
// 避免把 token / secret-like / 大 JSON value 刷到终端。
export function formatVariableListLine(variable: Variable): string {
    return `${variable.key}\t${variable.updatedAt}`;
}
