import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createCliSandbox, toRequest, writeAuthFile } from "../../../../__tests__/helpers.ts";

const apiBase = "https://websites-api.oomol.com";
// A response of the service, captured from a real run against the analytics
// backend (7 pageviews on 2 domains) and not edited by hand.
const analytics = {
    website_id: "0192f3a4-0000-7000-8000-0000000000ff",
    report_url: "https://analytics.oomol.com/teams/0192f3a4-0000-7000-8000-00000000000a/websites/0192f3a4-0000-7000-8000-0000000000ff",
    period: { from: "2026-11-05", to: "2026-11-11", start_at: 1793808000000, end_at: 1794375374661, timezone: "Asia/Shanghai", unit: "day", partial: true },
    summary: { visitors: 5, visits: 5, pageviews: 7, bounce_rate: 0.8, average_visit_seconds: 0 },
    previous: { start_at: 1793240625338, end_at: 1793807999999, visitors: 0, visits: 0, pageviews: 0, bounce_rate: null, average_visit_seconds: null },
    series: [
        { time: "2026-11-05", visitors: 0, pageviews: 0 },
        { time: "2026-11-06", visitors: 0, pageviews: 0 },
        { time: "2026-11-07", visitors: 0, pageviews: 0 },
        { time: "2026-11-08", visitors: 0, pageviews: 0 },
        { time: "2026-11-09", visitors: 0, pageviews: 0 },
        { time: "2026-11-10", visitors: 0, pageviews: 0 },
        { time: "2026-11-11", visitors: 5, pageviews: 7 },
    ],
    top: {
        pages: [
            { name: "/", visitors: 3, visits: 3, pageviews: 3 },
            { name: "/products", visitors: 2, visits: 2, pageviews: 2 },
            { name: "/contact", visitors: 1, visits: 1, pageviews: 1 },
            { name: "/z", visitors: 1, visits: 1, pageviews: 1 },
        ],
        referrers: [
            { name: "google.com", visitors: 1, visits: 1, pageviews: 1 },
            { name: "news.ycombinator.com", visitors: 1, visits: 1, pageviews: 1 },
            { name: "twitter.com", visitors: 1, visits: 1, pageviews: 1 },
        ],
        hostnames: [
            { name: "0192f3a4-0000-7000-8000-0000000000ff.sitelive.net", visitors: 2, visits: 2, pageviews: 4 },
            { name: "www.customer-example.com", visitors: 2, visits: 2, pageviews: 2 },
            { name: "a.com", visitors: 1, visits: 1, pageviews: 1 },
        ],
        countries: [
            { name: "AU", visitors: 1, visits: 1, pageviews: 1 },
            { name: "CN", visitors: 1, visits: 1, pageviews: 1 },
            { name: "DE", visitors: 1, visits: 1, pageviews: 1 },
            { name: "US", visitors: 1, visits: 1, pageviews: 3 },
        ],
        devices: [
            { name: "laptop", visitors: 3, visits: 3, pageviews: 5 },
            { name: "mobile", visitors: 2, visits: 2, pageviews: 2 },
        ],
        browsers: [
            { name: "chrome", visitors: 3, visits: 3, pageviews: 5 },
            { name: "ios", visitors: 2, visits: 2, pageviews: 2 },
        ],
        channels: [
            { name: "direct", visitors: 2 },
            { name: "organicSocial", visitors: 2 },
            { name: "organicSearch", visitors: 1 },
        ],
    },
    generated_at: 1794375374661,
};
const websiteId = analytics.website_id;

describe("website analytics command", () => {
    test("returns the service data as JSON, including fields the CLI does not know", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            let request: Request | undefined;
            const body = { ...analytics, added_later: { kept: true }, top: { ...analytics.top, cities: [{ name: "Berlin", visitors: 1 }] } };
            const result = await sandbox.run(["website", "analytics", "--site", websiteId, "--days", "7", "--timezone", "Asia/Shanghai", "--limit", "5", "--team", "team-a", "--json"], {
                fetcher: async (input, init) => {
                    request = toRequest(input, init);
                    return Response.json({ analytics: body });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual(body);
            const url = new URL(request!.url);
            expect(request!.method).toBe("GET");
            expect(url.origin + url.pathname).toBe(`${apiBase}/v1/websites/${websiteId}/analytics`);
            expect(Object.fromEntries(url.searchParams)).toEqual({ days: "7", limit: "5", timezone: "Asia/Shanghai" });
            expect(request!.headers.get("x-oo-team-name")).toBe("team-a");
            expect(request!.headers.get("Idempotency-Key")).toBeNull();
        }
        finally { await sandbox.cleanup(); }
    });

    test("prints a summary with the previous period, the breakdowns and the report URL", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const result = await sandbox.run(["website", "analytics", "--site", websiteId], {
                fetcher: async () => Response.json({ analytics }),
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe([
                "Visits from 2026-11-05 to 2026-11-11 (Asia/Shanghai, the last day is not over yet)",
                "  - Visitors: 5 (previous period: 0)",
                "  - Visits: 5 (previous period: 0)",
                "  - Pageviews: 7 (previous period: 0)",
                "  - Bounce rate: 80% (previous period: -)",
                "  - Average visit: 0s (previous period: -)",
                "Top pages (visitors / pageviews)",
                "  - /: 3 / 3",
                "  - /products: 2 / 2",
                "  - /contact: 1 / 1",
                "  - /z: 1 / 1",
                "Channels (visitors)",
                "  - direct: 2",
                "  - organicSocial: 2",
                "  - organicSearch: 1",
                "Referrers (visitors / pageviews)",
                "  - google.com: 1 / 1",
                "  - news.ycombinator.com: 1 / 1",
                "  - twitter.com: 1 / 1",
                "Domains (visitors / pageviews)",
                "  - 0192f3a4-0000-7000-8000-0000000000ff.sitelive.net: 2 / 4",
                "  - www.customer-example.com: 2 / 2",
                "  - a.com: 1 / 1",
                "Countries (visitors / pageviews)",
                "  - AU: 1 / 1",
                "  - CN: 1 / 1",
                "  - DE: 1 / 1",
                "  - US: 1 / 3",
                "Devices (visitors / pageviews)",
                "  - laptop: 3 / 5",
                "  - mobile: 2 / 2",
                "Browsers (visitors / pageviews)",
                "  - chrome: 3 / 5",
                "  - ios: 2 / 2",
                `Full report: ${analytics.report_url}`,
                "",
            ].join("\n"));
        }
        finally { await sandbox.cleanup(); }
    });

    test("leaves out empty breakdowns and shows a finished period without the partial note", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const empty = {
                ...analytics,
                period: { ...analytics.period, partial: false },
                summary: { visitors: 0, visits: 0, pageviews: 0, bounce_rate: null, average_visit_seconds: null },
                previous: { ...analytics.previous, visitors: 12, visits: 14, pageviews: 30, bounce_rate: 0.5, average_visit_seconds: 95 },
                top: { pages: [], referrers: [], hostnames: [], countries: [], devices: [], browsers: [], channels: [] },
            };
            const result = await sandbox.run(["website", "analytics", "--site", websiteId], {
                fetcher: async () => Response.json({ analytics: empty }),
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe([
                "Visits from 2026-11-05 to 2026-11-11 (Asia/Shanghai)",
                "  - Visitors: 0 (previous period: 12)",
                "  - Visits: 0 (previous period: 14)",
                "  - Pageviews: 0 (previous period: 30)",
                "  - Bounce rate: - (previous period: 50%)",
                "  - Average visit: - (previous period: 1m 35s)",
                `Full report: ${analytics.report_url}`,
                "",
            ].join("\n"));
        }
        finally { await sandbox.cleanup(); }
    });

    test("sends a date range instead of days and defaults to the system time zone", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const queries: Record<string, string>[] = [];
            const fetcher = async (input: Parameters<typeof toRequest>[0], init: Parameters<typeof toRequest>[1]) => {
                queries.push(Object.fromEntries(new URL(toRequest(input, init).url).searchParams));
                return Response.json({ analytics });
            };
            const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            expect((await sandbox.run(["website", "analytics", "--site", websiteId, "--from", "2026-11-01", "--to", "2026-11-07", "--json"], { fetcher })).exitCode).toBe(0);
            expect((await sandbox.run(["website", "analytics", "--site", websiteId, "--json"], { fetcher })).exitCode).toBe(0);
            // 90 days with both ends included is the longest period.
            expect((await sandbox.run(["website", "analytics", "--site", websiteId, "--from", "2026-01-01", "--to", "2026-03-31", "--json"], { fetcher })).exitCode).toBe(0);
            expect(queries).toEqual([
                { from: "2026-11-01", timezone: systemTimezone, to: "2026-11-07" },
                { timezone: systemTimezone },
                { from: "2026-01-01", timezone: systemTimezone, to: "2026-03-31" },
            ]);
        }
        finally { await sandbox.cleanup(); }
    });

    test("rejects an invalid period before any request", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const cases = [
                ["--days", "0"],
                ["--days", "91"],
                ["--days", "a week"],
                ["--limit", "51"],
                ["--from", "2026-11-01"],
                ["--to", "2026-11-07"],
                ["--from", "2026-11-07", "--to", "2026-11-01"],
                ["--from", "2026-01-01", "--to", "2026-04-01"],
                ["--from", "2999-01-01", "--to", "2999-01-02"],
                ["--from", "2026-02-30", "--to", "2026-03-01"],
                ["--from", "11/01/2026", "--to", "2026-11-07"],
                ["--days", "7", "--from", "2026-11-01", "--to", "2026-11-07"],
                ["--timezone", "Asia/Shangai"],
                ["--timezone", "+08:00"],
                ["--timezone", ""],
            ];
            for (const args of cases) {
                let requested = false;
                const result = await sandbox.run(["website", "analytics", "--site", websiteId, ...args, "--json"], {
                    fetcher: async () => {
                        requested = true;
                        return Response.json({ analytics });
                    },
                });
                expect(result.exitCode, args.join(" ")).toBe(2);
                expect(requested, args.join(" ")).toBe(false);
            }
        }
        finally { await sandbox.cleanup(); }
    });

    test("explains a website without statistics and an unavailable analytics service", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            const cases = [
                { status: 409, code: "analytics_not_ready", message: "Website has no analytics yet, it is set up after the first publication", text: "no visit statistics yet" },
                { status: 502, code: "analytics_unavailable", message: "Analytics unavailable", text: "temporarily unavailable" },
            ];
            for (const item of cases) {
                let requests = 0;
                const result = await sandbox.run(["website", "analytics", "--site", websiteId, "--json"], {
                    fetcher: async () => {
                        requests += 1;
                        return Response.json({ message: item.message, code: item.code }, { status: item.status });
                    },
                });
                expect(result.exitCode).toBe(1);
                // A 502 is repeated by the CLI-wide fetcher only (2 retries),
                // without the website client's own retries on top of it.
                expect(requests).toBe(item.status === 502 ? 3 : 1);
                const { error } = JSON.parse(result.stderr) as { error: { message: string; details: { serviceCode: string; httpStatus: number } } };
                expect(error.message).toContain(item.text);
                expect(error.details).toEqual({ httpStatus: item.status, serviceCode: item.code });
            }
        }
        finally { await sandbox.cleanup(); }
    });

    test("reads the website from the project directory when --site is omitted", async () => {
        const sandbox = await createCliSandbox();
        try {
            await writeAuthFile(sandbox);
            await Bun.write(join(sandbox.cwd, "sitelive-website.json"), JSON.stringify({ website_id: websiteId, team_id: "team-a" }));
            let url = "";
            const result = await sandbox.run(["website", "analytics", "--days", "1", "--json"], {
                fetcher: async (input, init) => {
                    url = toRequest(input, init).url;
                    return Response.json({ analytics });
                },
            });
            expect(result.exitCode).toBe(0);
            expect(new URL(url).pathname).toBe(`/v1/websites/${websiteId}/analytics`);
        }
        finally { await sandbox.cleanup(); }
    });
});
