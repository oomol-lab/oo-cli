import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    readCommandTelemetryProperties,
    toRequest,
    writeAuthFile,
} from "../../../__tests__/helpers.ts";

describe("open CLI", () => {
    test("prints a sign-in URL embedding the session code and default redirect", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(["open"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        expires_in: 300,
                        session_code: "code-1",
                    }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.method).toBe("POST");
            expect(requests[0]?.url).toBe(
                "https://api.oomol.com/v1/auth/session_code",
            );
            expect(requests[0]?.headers.get("authorization")).toBe("Bearer secret-1");
            expect(result.stdout).toContain(
                "https://api.oomol.com/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fconsole.oomol.com%2F&session_code=code-1",
            );
            expect(result.stdout).toContain("300");
            expect(result.stdout).not.toContain("secret-1");
            expect(readCommandTelemetryProperties(sandbox, "open"))
                .toMatchObject({
                    command_full: "open",
                    has_custom_redirect: false,
                });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("emits JSON output and honors --redirect", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["open", "--redirect", "https://flow.oomol.com/apps?tab=1", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        expires_in: 300,
                        session_code: "code-2",
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                expiresIn: 300,
                url: "https://api.oomol.com/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fflow.oomol.com%2Fapps%3Ftab%3D1&session_code=code-2",
            });

            // This invocation is the one that holds a raw redirect value, so
            // the no-raw-values telemetry guard has to live here.
            const telemetryProperties = readCommandTelemetryProperties(sandbox, "open");

            expect(telemetryProperties).toMatchObject({
                command_full: "open",
                has_custom_redirect: true,
            });
            expect(telemetryProperties).not.toHaveProperty("redirect");
            expect(JSON.stringify(telemetryProperties)).not.toContain("flow.oomol.com");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects an off-endpoint redirect before contacting the backend", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["open", "--redirect", "https://example.com/"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response("{}");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(requests).toHaveLength(0);
            expect(result.stderr).toContain("https://example.com/");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires a logged-in account", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["open"]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("You must log in");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports a non-success backend status", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["open"], {
                fetcher: async () => new Response("{}", { status: 500 }),
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("HTTP 500");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
