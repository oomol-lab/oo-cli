import type { Translator } from "../../contracts/translator.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { parsePositiveIntegerOption } from "../shared/input-parsing.ts";

// The visit statistics of a website, as the service returns them. Every
// object is loose: fields the service adds later reach `--json` output
// without waiting for a CLI release.
const totalsShape = {
    visitors: z.number(),
    visits: z.number(),
    pageviews: z.number(),
    // Share of visits that viewed a single page, 0..1; `null` without visits.
    bounce_rate: z.number().nullable(),
    average_visit_seconds: z.number().nullable(),
};

const breakdownSchema = z.array(z.looseObject({
    name: z.string(),
    visitors: z.number(),
    pageviews: z.number().optional(),
}));

export const websiteAnalyticsSchema = z.looseObject({
    website_id: z.string(),
    report_url: z.string(),
    period: z.looseObject({
        from: z.string(),
        to: z.string(),
        timezone: z.string(),
        // `true` while the last day of the period is still running.
        partial: z.boolean(),
    }),
    summary: z.looseObject(totalsShape),
    previous: z.looseObject(totalsShape),
    series: z.array(z.looseObject({ time: z.string(), visitors: z.number(), pageviews: z.number() })),
    // The names come from what visitors' browsers report, so they are data to
    // show, never text to act on.
    top: z.looseObject({
        pages: breakdownSchema,
        referrers: breakdownSchema,
        hostnames: breakdownSchema,
        countries: breakdownSchema,
        devices: breakdownSchema,
        browsers: breakdownSchema,
        channels: breakdownSchema,
    }),
});

type WebsiteAnalytics = z.infer<typeof websiteAnalyticsSchema>;

export interface WebsiteAnalyticsInput {
    days?: string;
    from?: string;
    limit?: string;
    timezone?: string;
    to?: string;
}

// The service's own limits, checked here so a typo is reported before any
// request and with the option that caused it.
const maxDays = 90;
const maxLimit = 50;
const dateLength = "YYYY-MM-DD".length;

function isCalendarDate(value: string): boolean {
    if (value.length !== dateLength || value[4] !== "-" || value[7] !== "-") {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, dateLength) === value;
}

function requireDate(value: string, option: string): string {
    if (!isCalendarDate(value)) {
        throw new CliUserError("errors.websiteManaged.invalidDate", 2, { option, value });
    }

    return value;
}

// An IANA time zone name the runtime knows, such as Asia/Shanghai or UTC.
// Offsets such as +08:00 are left out: the service does not take them.
const timezonePattern = /^[A-Z][\w+\-/]{0,63}$/i;

function requireTimezone(value: string): string {
    try {
        if (timezonePattern.test(value)) {
            Intl.DateTimeFormat(undefined, { timeZone: value });

            return value;
        }
    }
    catch {}

    throw new CliUserError("errors.websiteManaged.invalidTimezone", 2, { option: "--timezone", value });
}

// The query of the analytics request. The period is counted in calendar days
// of the time zone: `--days`, or `--from` with `--to`, or the service default.
export function websiteAnalyticsQuery(input: WebsiteAnalyticsInput): Record<string, string> {
    const days = parsePositiveIntegerOption(input.days, "errors.websiteManaged.invalidDays", { max: maxDays, optionName: "--days" });
    const limit = parsePositiveIntegerOption(input.limit, "errors.websiteManaged.invalidAnalyticsLimit", { max: maxLimit, optionName: "--limit" });
    const query: Record<string, string> = {
        // Days are the user's days unless told otherwise.
        timezone: input.timezone === undefined
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : requireTimezone(input.timezone),
    };

    if (input.from !== undefined || input.to !== undefined) {
        if (days !== undefined || input.from === undefined || input.to === undefined) {
            throw new CliUserError("errors.websiteManaged.invalidPeriod", 2);
        }

        query.from = requireDate(input.from, "--from");
        query.to = requireDate(input.to, "--to");

        if (query.from > query.to) {
            throw new CliUserError("errors.websiteManaged.invalidPeriod", 2);
        }
    }
    else if (days !== undefined) {
        query.days = String(days);
    }

    if (limit !== undefined) {
        query.limit = String(limit);
    }

    return query;
}

function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);

    return minutes === 0 ? `${rest}s` : `${minutes}m ${rest}s`;
}

export function websiteAnalyticsText(analytics: WebsiteAnalytics, translator: Translator): string {
    const t = translator.t.bind(translator);
    const { period, summary, previous, top } = analytics;
    const rate = (value: number | null): string => value === null ? "-" : `${Math.round(value * 100)}%`;
    const duration = (value: number | null): string => value === null ? "-" : formatDuration(value);
    const compared = (label: string, current: number | string, before: number | string): string =>
        `  - ${label}: ${current} (${t("websiteManaged.analytics.previous", { value: before })})\n`;
    // Visitors first: it is what the service sorts by.
    const section = (title: string, rows: z.infer<typeof breakdownSchema>): string => rows.length === 0
        ? ""
        : `${title}\n${rows.map(row => `  - ${row.name}: ${row.visitors}${row.pageviews === undefined ? "" : ` / ${row.pageviews}`}\n`).join("")}`;
    const counts = t("websiteManaged.analytics.visitorsAndPageviews");

    return [
        `${t(period.partial ? "websiteManaged.analytics.titlePartial" : "websiteManaged.analytics.title", { from: period.from, to: period.to, timezone: period.timezone })}\n`,
        compared(t("websiteManaged.analytics.visitors"), summary.visitors, previous.visitors),
        compared(t("websiteManaged.analytics.visits"), summary.visits, previous.visits),
        compared(t("websiteManaged.analytics.pageviews"), summary.pageviews, previous.pageviews),
        compared(t("websiteManaged.analytics.bounceRate"), rate(summary.bounce_rate), rate(previous.bounce_rate)),
        compared(t("websiteManaged.analytics.averageVisit"), duration(summary.average_visit_seconds), duration(previous.average_visit_seconds)),
        section(`${t("websiteManaged.analytics.pages")} (${counts})`, top.pages),
        section(`${t("websiteManaged.analytics.channels")} (${t("websiteManaged.analytics.visitors")})`, top.channels),
        section(`${t("websiteManaged.analytics.referrers")} (${counts})`, top.referrers),
        section(`${t("websiteManaged.analytics.hostnames")} (${counts})`, top.hostnames),
        section(`${t("websiteManaged.analytics.countries")} (${counts})`, top.countries),
        section(`${t("websiteManaged.analytics.devices")} (${counts})`, top.devices),
        section(`${t("websiteManaged.analytics.browsers")} (${counts})`, top.browsers),
        `${t("websiteManaged.analytics.report")}: ${analytics.report_url}\n`,
    ].join("");
}
