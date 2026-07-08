import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";

const organizationsResponse = {
    organizations: [
        {
            id: "org-1",
            name: "acme",
            avatar: "",
            creator_user_id: "user-1",
            role: "creator",
        },
        {
            id: "org-2",
            name: "beta",
            role: "member",
        },
    ],
};

describe("orgCommand CLI", () => {
    test("lists accessible organizations as JSON and marks the configured default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.organization", "acme"]);

            const requests: Request[] = [];
            const result = await sandbox.run(["org", "list", "--json"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(organizationsResponse));
                },
            });
            const telemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "org.list");

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://org-control.oomol.com/v1/me/organizations",
            );
            expect(requests[0]?.headers.get("authorization")).toBe("secret-1");
            expect(JSON.parse(result.stdout)).toEqual([
                { name: "acme", id: "org-1", role: "creator", current: true },
                { name: "beta", id: "org-2", role: "member", current: false },
            ]);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "org.list",
                    result_count_bucket: "1-5",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("organization");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders accessible organizations as an aligned text table", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["org", "list"], {
                fetcher: async () => new Response(JSON.stringify(organizationsResponse)),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("acme");
            expect(result.stdout).toContain("beta");
            expect(result.stdout).toContain("creator");
            expect(result.stdout).toContain("member");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports personal identity when the account has no organizations", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["org", "list"], {
                fetcher: async () => new Response(JSON.stringify({ organizations: [] })),
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails to list organizations without an account", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requested = false;
            const result = await sandbox.run(["org", "list"], {
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify({ organizations: [] }));
                },
            });

            expect(result.exitCode).toBe(1);
            expect(requested).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("shows the default organization identity via current", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.organization", "acme"]);

            const jsonResult = await sandbox.run(["org", "current", "--json"]);
            const textResult = await sandbox.run(["org", "current"]);

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({ organization: "acme" });
            expect(textResult.stdout).toContain("acme");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports personal identity via current when no default is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const jsonResult = await sandbox.run(["org", "current", "--json"]);
            const textResult = await sandbox.run(["org", "current"]);

            expect(jsonResult.exitCode).toBe(0);
            expect(JSON.parse(jsonResult.stdout)).toEqual({ organization: null });
            expect(textResult.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("sets the default organization with use after checking membership", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const useResult = await sandbox.run(["org", "use", "beta"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(organizationsResponse));
                },
            });
            const currentResult = await sandbox.run(["org", "current", "--json"]);

            expect(useResult.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(JSON.parse(currentResult.stdout)).toEqual({ organization: "beta" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects use for an organization the account cannot access", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["org", "use", "ghost"], {
                fetcher: async () => new Response(JSON.stringify(organizationsResponse)),
            });
            const currentResult = await sandbox.run(["org", "current", "--json"]);

            expect(result.exitCode).toBe(1);
            expect(JSON.parse(currentResult.stdout)).toEqual({ organization: null });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("clears the default organization identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.organization", "acme"]);

            const clearResult = await sandbox.run(["org", "clear"]);
            const currentResult = await sandbox.run(["org", "current", "--json"]);

            expect(clearResult.exitCode).toBe(0);
            expect(JSON.parse(currentResult.stdout)).toEqual({ organization: null });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports already-personal when clearing with no configured organization", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["org", "clear"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("personal identity");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
