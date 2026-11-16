import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { SpaceQuota, SpaceUsageRecord } from "./api.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { formatFileSize } from "../shared/file-size.ts";
import { formatTextTable } from "../shared/text-table.ts";
import { createSpacesClient, listUsage } from "./api.ts";
import { isDigits } from "./duration.ts";
import { formatTime, orDash, spaceArgument, spaceInput, teamOptions } from "./shared.ts";

// Daily usage snapshots of a space, one per UTC day. For a space on Convex the
// table shows the three metrics people look at most; the metric set follows
// the backend, so the full set is in the JSON output only. A space with a
// platform-hosted backend also has quotas, listed below the snapshots.

function parseDay(value: string, option: string): string {
    const day = value.trim();
    const [year, month, date, ...rest] = day.split("-");

    if (rest.length > 0 || year?.length !== 4 || month?.length !== 2 || date?.length !== 2 || !isDigits(`${year}${month}${date}`)) {
        throw new CliUserError("errors.spaces.invalidDay", 2, { option, value });
    }

    // The calendar decides the rest: a day such as 2026-02-30 does not survive
    // the round trip.
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));

    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
        throw new CliUserError("errors.spaces.invalidDay", 2, { option, value });
    }

    return day;
}

// Integers as is, fractions with at most four decimals: traffic in GB is
// usually a number like 0.0012.
export function formatMetric(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function metric(record: SpaceUsageRecord, name: string, field: "currentDay" | "currentMonth"): string {
    const value = record.metrics[name]?.[field];

    return value === undefined ? "-" : formatMetric(value);
}

interface QuotaRow {
    day: string;
    exhausted: string;
    name: string;
    period: string;
}

// One row per quota: counters have a daily and a billing period allowance,
// capacities (storage) only one level, shown under the period.
function quotaRows(quota: SpaceQuota): QuotaRow[] {
    const amount = (used: number, limit: number): string => `${formatMetric(used)} / ${formatMetric(limit)}`;

    return [
        ...quota.counters.map(counter => ({
            day: amount(counter.day.used, counter.day.limit),
            exhausted: counter.exhausted ?? "-",
            name: counter.name,
            period: amount(counter.period.used, counter.period.limit),
        })),
        ...quota.capacities.map(capacity => ({
            day: "-",
            exhausted: capacity.exhausted ? "storage" : "-",
            name: capacity.name,
            period: `${formatFileSize(capacity.used)} / ${formatFileSize(capacity.limit)}`,
        })),
    ];
}

const usageInput = spaceInput.extend({ from: z.string().optional(), to: z.string().optional() });

export const usageCommand: CliCommandDefinition<z.infer<typeof usageInput>> = {
    name: "usage",
    summaryKey: "commands.spaces.usage.summary",
    descriptionKey: "commands.spaces.usage.description",
    output: "standard",
    inputSchema: usageInput,
    arguments: [spaceArgument],
    options: [
        ...teamOptions,
        { name: "from", longFlag: "--from", valueName: "day", descriptionKey: "options.spaces.usageFrom" },
        { name: "to", longFlag: "--to", valueName: "day", descriptionKey: "options.spaces.usageTo" },
    ],
    handler: async (input, context) => {
        const range = {
            from: input.from === undefined ? undefined : parseDay(input.from, "--from"),
            to: input.to === undefined ? undefined : parseDay(input.to, "--to"),
        };
        const usage = await listUsage(await createSpacesClient(input, context), input.space, range);

        context.output.emit(usage, () => {
            const t = context.translator.t.bind(context.translator);

            const colors = createWriterColors(context.stdout);
            const quota = usage.quota ?? undefined;
            const writeQuota = (): void => {
                if (quota !== undefined) {
                    context.stdout.write(`${formatTextTable<QuotaRow>([
                        { header: t("spaces.text.quota"), render: row => row.name },
                        { header: t("spaces.text.quotaDay"), render: row => row.day },
                        { header: t("spaces.text.quotaPeriod"), render: row => row.period },
                        { header: t("spaces.text.quotaExhausted"), render: row => row.exhausted },
                    ], quotaRows(quota), colors)}\n`);
                }
            };

            if (usage.items.length === 0) {
                context.stdout.write(`${t("spaces.text.noUsage", { from: usage.from, to: usage.to })}\n`);
                writeQuota();
                return;
            }

            context.stdout.write(`${formatTextTable<SpaceUsageRecord>([
                { header: t("spaces.text.day"), render: record => record.day },
                { header: t("spaces.text.seed"), render: record => orDash(record.seedStatus) },
                { header: t("spaces.text.callsDay"), render: record => metric(record, "functionCalls", "currentDay") },
                { header: t("spaces.text.callsMonth"), render: record => metric(record, "functionCalls", "currentMonth") },
                { header: t("spaces.text.databaseIo"), render: record => metric(record, "databaseIoGb", "currentDay") },
                { header: t("spaces.text.egress"), render: record => metric(record, "dataEgressGb", "currentDay") },
                { header: t("spaces.text.sampledAt"), render: record => formatTime(record.sampledAt) },
            ], usage.items, colors)}\n`);
            writeQuota();
        });
    },
};
