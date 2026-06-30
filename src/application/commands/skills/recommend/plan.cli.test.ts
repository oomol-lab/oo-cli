import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../../../__tests__/helpers.ts";
import { packageInfoResponse, seedRegistrySkill } from "../__tests__/helpers.ts";

// A fetcher that fails any request, used to prove a path performs no network
// lookup. If the command were to reach the registry, the assertions on the
// returned plan would diverge from the offline expectation.
function throwingFetcher(): never {
    throw new Error("Unexpected network request");
}

describe("skills recommend plan CLI", () => {
    test("--json recommends install for a published service with no local install", async () => {
        const sandbox = await createCliSandbox();

        try {
            // No auth file: the public package-info check needs no login, and no
            // Authorization header is sent.
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);
                        if (request.url.includes("package-info/oo-gmail")) {
                            return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.muted).toBe(false);
            expect(plan.recommendations).toEqual([
                { packageName: "oo-gmail", action: "install" },
            ]);
            expect(plan.skipped).toEqual([]);
            // The package-info request carries no Authorization header.
            expect(requests).toHaveLength(1);
            expect(requests[0]?.headers.get("authorization")).toBeNull();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json maps underscore services to hyphenated packages", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requestedUrls: string[] = [];
            const result = await sandbox.run(
                ["skills", "recommend", "plan", "aliyun_oss", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requestedUrls.push(request.url);
                        if (request.url.includes("package-info/oo-aliyun-oss")) {
                            return packageInfoResponse("oo-aliyun-oss", "1.0.0", "aliyun-oss");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.recommendations).toEqual([
                { packageName: "oo-aliyun-oss", action: "install" },
            ]);
            // The transform replaced the underscore before the registry lookup.
            expect(requestedUrls.some(url => url.includes("oo-aliyun_oss"))).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json recommends update for an outdated install and skips a current one", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "notion",
                packageName: "oo-notion",
                version: "1.0.0",
            });
            await seedRegistrySkill({
                sandbox,
                skillName: "drive",
                packageName: "oo-drive",
                version: "2.0.0",
            });

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "notion", "drive", "gmail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("package-info/oo-notion")) {
                            return packageInfoResponse("oo-notion", "2.0.0", "notion");
                        }
                        if (request.url.includes("package-info/oo-drive")) {
                            return packageInfoResponse("oo-drive", "2.0.0", "drive");
                        }
                        if (request.url.includes("package-info/oo-gmail")) {
                            return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.recommendations).toEqual([
                {
                    packageName: "oo-notion",
                    action: "update",
                    currentVersion: "1.0.0",
                    latestVersion: "2.0.0",
                },
                { packageName: "oo-gmail", action: "install" },
            ]);
            expect(plan.skipped).toEqual([
                { packageName: "oo-drive", reason: "up-to-date" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json silently skips an unpublished service (404)", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "nope", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("package-info/oo-nope")) {
                            return new Response("", { status: 404 });
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.recommendations).toEqual([]);
            expect(plan.skipped).toEqual([
                { packageName: "oo-nope", reason: "not-published" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json skips a service when the registry lookup errors", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "slack", "--json"],
                {
                    fetcher: async () => {
                        throw new Error("network blip");
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.recommendations).toEqual([]);
            expect(plan.skipped).toEqual([
                { packageName: "oo-slack", reason: "lookup-failed" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json degrades a server error (500) to a lookup-failed skip", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("package-info/oo-gmail")) {
                            return new Response("", { status: 500 });
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            // A non-billing request failure must not block the best-effort
            // wrap-up; it becomes a silent lookup-failed skip.
            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.recommendations).toEqual([]);
            expect(plan.skipped).toEqual([
                { packageName: "oo-gmail", reason: "lookup-failed" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json skips a dismissed package without a network lookup", async () => {
        const sandbox = await createCliSandbox();

        try {
            const muteResult = await sandbox.run(
                ["skills", "recommend", "mute", "oo-gmail", "--json"],
            );

            expect(muteResult.exitCode).toBe(0);

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher: throwingFetcher },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.recommendations).toEqual([]);
            expect(plan.skipped).toEqual([
                { packageName: "oo-gmail", reason: "dismissed" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json short-circuits to muted skips without any network lookup", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedRegistrySkill({
                sandbox,
                skillName: "notion",
                packageName: "oo-notion",
                version: "1.0.0",
            });
            const muteResult = await sandbox.run(
                ["skills", "recommend", "mute", "--all", "--json"],
            );

            expect(muteResult.exitCode).toBe(0);

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "notion", "--json"],
                { fetcher: throwingFetcher },
            );

            expect(result.exitCode).toBe(0);
            const plan = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(plan.muted).toBe(true);
            expect(plan.recommendations).toEqual([]);
            expect(plan.skipped).toEqual([
                { packageName: "oo-notion", reason: "muted" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text output lists install suggestions", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["skills", "recommend", "plan", "gmail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("package-info/oo-gmail")) {
                            return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                        }
                        throw new Error(`Unexpected request: ${request.url}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("oo-gmail");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json suppresses a recommendation already surfaced earlier this session", async () => {
        const sandbox = await createCliSandbox();

        try {
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                if (request.url.includes("package-info/oo-gmail")) {
                    return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                }
                throw new Error(`Unexpected request: ${request.url}`);
            };

            const first = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher },
            );
            const firstPlan = JSON.parse(first.stdout) as Record<string, unknown>;

            expect(firstPlan.recommendations).toEqual([
                { packageName: "oo-gmail", action: "install" },
            ]);
            expect(firstPlan.skipped).toEqual([]);

            // A second wrap-up in the same session must not re-surface the same
            // suggestion; it is demoted to a recently-suggested skip.
            const second = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher },
            );
            const secondPlan = JSON.parse(second.stdout) as Record<string, unknown>;

            expect(secondPlan.recommendations).toEqual([]);
            expect(secondPlan.skipped).toEqual([
                { packageName: "oo-gmail", reason: "recently-suggested" },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json still surfaces a different service after another was suggested", async () => {
        const sandbox = await createCliSandbox();

        try {
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                if (request.url.includes("package-info/oo-gmail")) {
                    return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                }
                if (request.url.includes("package-info/oo-notion")) {
                    return packageInfoResponse("oo-notion", "1.0.0", "notion");
                }
                throw new Error(`Unexpected request: ${request.url}`);
            };

            await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher },
            );
            const second = await sandbox.run(
                ["skills", "recommend", "plan", "notion", "--json"],
                { fetcher },
            );
            const secondPlan = JSON.parse(second.stdout) as Record<string, unknown>;

            expect(secondPlan.recommendations).toEqual([
                { packageName: "oo-notion", action: "install" },
            ]);
            expect(secondPlan.skipped).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--force re-surfaces a recommendation suppressed by the session cooldown", async () => {
        const sandbox = await createCliSandbox();

        try {
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                if (request.url.includes("package-info/oo-gmail")) {
                    return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                }
                throw new Error(`Unexpected request: ${request.url}`);
            };

            await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher },
            );
            const forced = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--force", "--json"],
                { fetcher },
            );
            const forcedPlan = JSON.parse(forced.stdout) as Record<string, unknown>;

            expect(forcedPlan.recommendations).toEqual([
                { packageName: "oo-gmail", action: "install" },
            ]);
            expect(forcedPlan.skipped).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json re-surfaces when a suggestion changes from install to update", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                if (request.url.includes("package-info/oo-notion")) {
                    return packageInfoResponse("oo-notion", "2.0.0", "notion");
                }
                throw new Error(`Unexpected request: ${request.url}`);
            };

            const first = await sandbox.run(
                ["skills", "recommend", "plan", "notion", "--json"],
                { fetcher },
            );

            expect((JSON.parse(first.stdout) as Record<string, unknown>).recommendations)
                .toEqual([{ packageName: "oo-notion", action: "install" }]);

            // Installing an older version flips the suggestion to `update`, which
            // is a different cooldown key, so it surfaces again.
            await seedRegistrySkill({
                sandbox,
                skillName: "notion",
                packageName: "oo-notion",
                version: "1.0.0",
            });

            const second = await sandbox.run(
                ["skills", "recommend", "plan", "notion", "--json"],
                { fetcher },
            );
            const secondPlan = JSON.parse(second.stdout) as Record<string, unknown>;

            expect(secondPlan.recommendations).toEqual([
                {
                    packageName: "oo-notion",
                    action: "update",
                    currentVersion: "1.0.0",
                    latestVersion: "2.0.0",
                },
            ]);
            expect(secondPlan.skipped).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("muted plans do not consume the session cooldown", async () => {
        const sandbox = await createCliSandbox();

        try {
            const gmailFetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                if (request.url.includes("package-info/oo-gmail")) {
                    return packageInfoResponse("oo-gmail", "1.0.0", "gmail");
                }
                throw new Error(`Unexpected request: ${request.url}`);
            };

            const muteResult = await sandbox.run(
                ["skills", "recommend", "mute", "--all", "--json"],
            );

            expect(muteResult.exitCode).toBe(0);

            // While muted the plan surfaces nothing and must stamp nothing.
            const mutedRun = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher: throwingFetcher },
            );

            expect((JSON.parse(mutedRun.stdout) as Record<string, unknown>).muted).toBe(true);

            const unmuteResult = await sandbox.run(
                ["skills", "recommend", "unmute", "--all", "--json"],
            );

            expect(unmuteResult.exitCode).toBe(0);

            // The earlier muted run left no cooldown stamp, so the suggestion
            // surfaces normally now.
            const afterUnmute = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--json"],
                { fetcher: gmailFetcher },
            );
            const afterPlan = JSON.parse(afterUnmute.stdout) as Record<string, unknown>;

            expect(afterPlan.recommendations).toEqual([
                { packageName: "oo-gmail", action: "install" },
            ]);
            expect(afterPlan.skipped).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2 with a format error", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["skills", "recommend", "plan", "gmail", "--format", "xml"],
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
