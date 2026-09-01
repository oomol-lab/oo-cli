import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

export const connectorExecutionIdColor = "#59F78D";

/**
 * Renders the execution id and result data block shared by every connector
 * command that prints a backend execution result as text (`run`, `proxy`).
 * Keeping it in one place guarantees the two commands highlight identically.
 */
export function formatConnectorExecutionResultAsText(
    result: {
        data: unknown;
        executionId: string;
    },
    colors: TerminalColors,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    return [
        `${translator.t("connector.run.text.executionId")}: ${colors.hex(connectorExecutionIdColor)(result.executionId)}`,
        colors.bold(`${translator.t("connector.run.text.resultData")}:`),
        colors.cyan(JSON.stringify(result.data, null, 2) ?? "null"),
    ].join("\n");
}
