import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
    createTemporaryDirectory,
    defaultLoginDefaultTeamResponse,
    readLatestLogContent,
    toRequest,
    writeAuthFile,
} from "../../../__tests__/helpers.ts";
import { openFlowCommandRelease } from "./flow-release.ts";
import { resolveOpenFlowInvocation } from "./flow.ts";
import { formatByteCount } from "./shared/download-progress.ts";

describe("flow CLI", () => {
    test("recognizes flow after oo global options without consuming delegated options", () => {
        expect(
            resolveOpenFlowInvocation(["--debug", "--lang=zh", "flow", "dev", "--lang", "en"]),
        ).toEqual({
            args: ["dev", "--lang", "en"],
            commandIndex: 2,
        });
        expect(resolveOpenFlowInvocation(["help", "flow"])).toBeUndefined();
    });

    test("delegates all flow arguments and returns the Open Flow exit code", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-args-${Bun.randomUUIDv7()}`;
        const languageKey = `open-flow-language-${Bun.randomUUIDv7()}`;

        try {
            await writeCommandEntry(commandDirectory, [
                `Reflect.set(globalThis, ${JSON.stringify(captureKey)}, [...args]);`,
                `Reflect.set(globalThis, ${JSON.stringify(languageKey)}, host.language);`,
                "return 7;",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const result = await sandbox.run([
                "--lang",
                "zh",
                "flow",
                "run",
                "project.oo.yaml",
                "--connector-token",
                "secret-token",
            ]);

            expect(result).toEqual({
                exitCode: 7,
                stderr: "",
                stdout: "",
            });
            expect(Reflect.get(globalThis, captureKey)).toEqual([
                "run",
                "project.oo.yaml",
                "--connector-token",
                "secret-token",
            ]);
            expect(Reflect.get(globalThis, languageKey)).toBe("zh-CN");
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            Reflect.deleteProperty(globalThis, languageKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("connects Cloud requests with trusted identity headers", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        apiKey: "dev-secret",
                        endpoint: "oomol.com",
                        team: "platform",
                        teamId: "team-1",
                    },
                ],
            });
            await writeCommandEntry(commandDirectory, [
                "const cloudResponse = await host.cloudRequest('/v1/projects?limit=10', {",
                "    method: 'POST',",
                "    headers: { authorization: 'artifact-secret', 'content-type': 'application/json', 'x-oo-team-id': 'forged-team', 'x-oo-team-name': 'forged-name', 'x-oomol-token': 'forged-token' },",
                "    body: JSON.stringify({ name: 'Example' }),",
                "});",
                "return cloudResponse.status === 202 ? 0 : 9;",
            ]);
            sandbox.env.OO_ENDPOINT = "oomol.dev";
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "project", "list"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    return new URL(request.url).host === "relation-control.oomol.dev"
                        ? new Response(JSON.stringify({
                                id: "team-1",
                                name: "platform",
                                role: "member",
                                system_created: false,
                            }))
                        : new Response(null, { status: 202 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.dev/v1/teams/team-1",
                "https://open-flow.oomol.dev/v1/projects?limit=10",
            ]);
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.headers.get("authorization")).toBe("dev-secret");
            expect(requests[1]?.headers.get("x-oo-team-name")).toBe("platform");
            expect(requests[1]?.headers.get("x-oo-team-id")).toBe("team-1");
            expect(requests[1]?.headers.get("x-oomol-token")).toBeNull();
            expect(await requests[1]?.text()).toBe("{\"name\":\"Example\"}");
        }
        finally {
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("connects directly to Open Flow Server with the deployment operator token", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");

        try {
            await writeCommandEntry(commandDirectory, [
                "const response = await host.cloudRequest('/v1/projects?limit=10', {",
                "    headers: { authorization: 'forged', cookie: 'forged=1', 'x-oo-team-id': 'forged-team', 'x-oo-team-name': 'forged-name', 'x-oomol-token': 'forged-token' },",
                "});",
                "return response.status === 200 ? 0 : 9;",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;
            sandbox.env.OO_OPEN_FLOW_TOKEN = "server-operator-token";
            sandbox.env.OO_OPEN_FLOW_URL = "http://127.0.0.1:3000";

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "project", "list"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(null, { status: 200 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe("http://127.0.0.1:3000/v1/projects?limit=10");
            expect(requests[0]?.headers.get("authorization")).toBe(
                "Bearer server-operator-token",
            );
            expect(requests[0]?.headers.get("cookie")).toBeNull();
            expect(requests[0]?.headers.get("x-oo-team-id")).toBeNull();
            expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
            expect(requests[0]?.headers.get("x-oomol-token")).toBeNull();
        }
        finally {
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("requires a complete, origin-only Open Flow Server configuration", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");

        try {
            await writeCommandEntry(commandDirectory, [
                "await host.cloudRequest('/v1/projects');",
                "return 0;",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;
            sandbox.env.OO_OPEN_FLOW_URL = "http://127.0.0.1:3000";

            const incomplete = await sandbox.run(["flow", "project", "list"]);

            expect(incomplete.exitCode).toBe(1);
            expect(incomplete.stderr).toContain(
                "OO_OPEN_FLOW_URL and OO_OPEN_FLOW_TOKEN must be set together.",
            );

            sandbox.env.OO_OPEN_FLOW_TOKEN = "server-operator-token";
            sandbox.env.OO_OPEN_FLOW_URL = "http://127.0.0.1:3000/control";

            const invalid = await sandbox.run(["flow", "project", "list"]);

            expect(invalid.exitCode).toBe(1);
            expect(invalid.stderr).toContain(
                "OO_OPEN_FLOW_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.",
            );
        }
        finally {
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("selects a saved Flow account for one invocation without changing the active account", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");

        try {
            const authPath = await writeAuthFile(sandbox, {
                activeId: "user-prod",
                accounts: [
                    {
                        id: "user-prod",
                        name: "Alice",
                        apiKey: "prod-secret",
                        endpoint: "oomol.com",
                        team: "production",
                        teamId: "team-prod",
                    },
                    {
                        id: "user-dev",
                        name: "Alice",
                        apiKey: "dev-secret",
                        endpoint: "oomol.dev",
                        team: "development",
                        teamId: "team-dev",
                    },
                ],
            });
            await writeCommandEntry(commandDirectory, [
                "const response = await host.cloudRequest('/v1/projects');",
                "return response.status === 204 ? 0 : 9;",
            ]);
            sandbox.env.OO_FLOW_ACCOUNT = "oomol.dev/Alice";
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "project", "list"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    return new URL(request.url).host === "relation-control.oomol.dev"
                        ? new Response(JSON.stringify({
                                id: "team-dev",
                                name: "development",
                                role: "member",
                                system_created: false,
                            }))
                        : new Response(null, { status: 204 });
                },
            });

            expect(result.exitCode).toBe(0);
            // The selected account's default team is refreshed with that
            // account's credential and endpoint, then the request goes out.
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.dev/v1/teams/team-dev",
                "https://open-flow.oomol.dev/v1/projects",
            ]);
            expect(requests[0]?.headers.get("authorization")).toBe("dev-secret");
            expect(requests[1]?.headers.get("authorization")).toBe("dev-secret");
            expect(requests[1]?.headers.get("x-oo-team-id")).toBe("team-dev");
            expect(await Bun.file(authPath).text()).toStartWith("id = \"user-prod\"");
        }
        finally {
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("rejects Cloud control requests outside the configured gateway", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-cloud-error-${Bun.randomUUIDv7()}`;

        try {
            await writeAuthFile(sandbox);
            await writeCommandEntry(commandDirectory, [
                "try {",
                "    await host.cloudRequest('https://attacker.example/v1/projects', { method: 'GET' });",
                "    return 9;",
                "} catch (error) {",
                `    Reflect.set(globalThis, ${JSON.stringify(captureKey)}, error instanceof Error ? error.message : String(error));`,
                "    return 0;",
                "}",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "project", "list"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));
                    return new Response(null, { status: 404 });
                },
            });

            // Resolving the session asks for the server-default team (the
            // account has none saved); the forged request itself never leaves.
            expect(result.exitCode).toBe(0);
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.com/v1/me/default-team",
            ]);
            expect(Reflect.get(globalThis, captureKey)).toBe(
                "Open Flow requests must target the configured /v1/ gateway.",
            );
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("hands browser authentication to the official Team-scoped Workbench deep link", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-workbench-url-${Bun.randomUUIDv7()}`;

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        apiKey: "dev-secret",
                        endpoint: "oomol.com",
                        team: "platform/team",
                        teamId: "team-1",
                    },
                ],
            });
            await writeCommandEntry(commandDirectory, [
                "const catalogUrl = await host.getWorkbenchUrl();",
                "const flowUrl = await host.getWorkbenchUrl('flow/1');",
                `Reflect.set(globalThis, ${JSON.stringify(captureKey)}, { catalogUrl, flowUrl });`,
                "return 0;",
            ]);
            sandbox.env.OO_ENDPOINT = "oomol.dev";
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const signInRequests: Request[] = [];
            const result = await sandbox.run(["--debug", "flow", "workbench", "flow/1"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    if (new URL(request.url).host === "relation-control.oomol.dev") {
                        return new Response(JSON.stringify({
                            id: "team-1",
                            name: "platform/team",
                            role: "member",
                            system_created: false,
                        }));
                    }

                    signInRequests.push(request);

                    return new Response(JSON.stringify({
                        expires_in: 300,
                        session_code: `workbench-code-${signInRequests.length}`,
                    }));
                },
            });

            expect(result.exitCode).toBe(0);
            expect(Reflect.get(globalThis, captureKey)).toEqual({
                catalogUrl: "https://api.oomol.dev/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fconsole.oomol.dev%2Fteam%2Fplatform%252Fteam%2Fflows&session_code=workbench-code-1",
                flowUrl: "https://api.oomol.dev/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fconsole.oomol.dev%2Fteam%2Fplatform%252Fteam%2Fflows%2Fflow%252F1%2Fdesign&session_code=workbench-code-2",
            });
            // One refresh of the saved default, then one sign-in code per link.
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.dev/v1/teams/team-1",
                "https://api.oomol.dev/v1/auth/session_code",
                "https://api.oomol.dev/v1/auth/session_code",
            ]);
            expect(signInRequests[0]?.method).toBe("POST");
            expect(signInRequests[0]?.headers.get("authorization")).toBe("Bearer dev-secret");
            expect(await readLatestLogContent(sandbox)).not.toContain("workbench-code");
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    // The regression guard for a Flow that could be created but not opened:
    // with no saved team, both host paths must act for the one team the
    // backend reports, resolved once per invocation.
    test("acts for the server-side default team on Cloud requests and the Workbench deep link when no team is saved", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-default-team-${Bun.randomUUIDv7()}`;

        try {
            await writeAuthFile(sandbox);
            await writeCommandEntry(commandDirectory, [
                "const cloudResponse = await host.cloudRequest('/v1/projects', { method: 'GET' });",
                "const flowUrl = await host.getWorkbenchUrl('flow/1');",
                `Reflect.set(globalThis, ${JSON.stringify(captureKey)}, { flowUrl, status: cloudResponse.status });`,
                "return 0;",
            ]);
            sandbox.env.OO_ENDPOINT = "oomol.dev";
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "workbench", "flow/1"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    requests.push(request);

                    if (requestUrl.host === "relation-control.oomol.dev") {
                        return new Response(JSON.stringify(defaultLoginDefaultTeamResponse));
                    }

                    if (requestUrl.host === "api.oomol.dev") {
                        return new Response(JSON.stringify({
                            expires_in: 300,
                            session_code: "workbench-code-1",
                        }));
                    }

                    return new Response(null, { status: 202 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.dev/v1/me/default-team",
                "https://open-flow.oomol.dev/v1/projects",
                "https://api.oomol.dev/v1/auth/session_code",
            ]);
            expect(requests[1]?.headers.get("x-oo-team-name")).toBe("alice-team");
            expect(requests[1]?.headers.get("x-oo-team-id")).toBe("team-system-1");
            expect(Reflect.get(globalThis, captureKey)).toEqual({
                flowUrl: "https://api.oomol.dev/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fconsole.oomol.dev%2Fteam%2Falice-team%2Fflows%2Fflow%252F1%2Fdesign&session_code=workbench-code-1",
                status: 202,
            });
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    // The saved name is refreshed by id before it reaches a header or the
    // Workbench link: a rename keeps working, a deleted team is refused with
    // the remedy already translated, because the command artifact can only
    // print the message of whatever the host throws.
    test("acts for a renamed default team under its current name", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-renamed-team-${Bun.randomUUIDv7()}`;

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        apiKey: "dev-secret",
                        endpoint: "oomol.com",
                        team: "old-name",
                        teamId: "team-1",
                    },
                ],
            });
            await writeCommandEntry(commandDirectory, [
                "const cloudResponse = await host.cloudRequest('/v1/projects', { method: 'GET' });",
                "const flowUrl = await host.getWorkbenchUrl('flow/1');",
                `Reflect.set(globalThis, ${JSON.stringify(captureKey)}, { flowUrl, status: cloudResponse.status });`,
                "return 0;",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "workbench", "flow/1"], {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    requests.push(request);

                    if (requestUrl.host === "relation-control.oomol.com") {
                        return new Response(JSON.stringify({
                            id: "team-1",
                            name: "new-name",
                            role: "creator",
                            system_created: false,
                        }));
                    }

                    if (requestUrl.host === "api.oomol.com") {
                        return new Response(JSON.stringify({
                            expires_in: 300,
                            session_code: "workbench-code-1",
                        }));
                    }

                    return new Response(null, { status: 202 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.com/v1/teams/team-1",
                "https://open-flow.oomol.com/v1/projects",
                "https://api.oomol.com/v1/auth/session_code",
            ]);
            expect(requests[1]?.headers.get("x-oo-team-name")).toBe("new-name");
            expect(requests[1]?.headers.get("x-oo-team-id")).toBe("team-1");
            expect(Reflect.get(globalThis, captureKey)).toEqual({
                flowUrl: "https://api.oomol.com/v1/auth/session_code/exchange?redirect=https%3A%2F%2Fconsole.oomol.com%2Fteam%2Fnew-name%2Fflows%2Fflow%252F1%2Fdesign&session_code=workbench-code-1",
                status: 202,
            });
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("refuses a saved default team that no longer exists before any Cloud request", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-deleted-team-${Bun.randomUUIDv7()}`;

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        apiKey: "dev-secret",
                        endpoint: "oomol.com",
                        team: "acme",
                        teamId: "team-1",
                    },
                ],
            });
            await writeCommandEntry(commandDirectory, [
                "try {",
                "    await host.cloudRequest('/v1/projects');",
                "    return 9;",
                "} catch (error) {",
                `    Reflect.set(globalThis, ${JSON.stringify(captureKey)}, { message: error.message, name: error.name });`,
                "    return 0;",
                "}",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const requests: Request[] = [];
            const result = await sandbox.run(["flow", "project", "list"], {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response("{}", { status: 410 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requests.map(request => request.url)).toEqual([
                "https://relation-control.oomol.com/v1/teams/team-1",
            ]);
            // Translated at the host boundary, and still a CLI user error for
            // the host's own handler.
            expect(Reflect.get(globalThis, captureKey)).toEqual({
                message: "The saved default team \"acme\" cannot be used: this team has been deleted. Run `oo team use <name>` to pick another team, or `oo login` to refresh the default.",
                name: "CliUserError",
            });
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("explains the missing team when the backend reports no default team", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-no-team-${Bun.randomUUIDv7()}`;

        try {
            await writeAuthFile(sandbox);
            await writeCommandEntry(commandDirectory, [
                "try {",
                "    await host.getWorkbenchUrl();",
                "    return 9;",
                "} catch (error) {",
                `    Reflect.set(globalThis, ${JSON.stringify(captureKey)}, error instanceof Error ? error.message : String(error));`,
                "    return 0;",
                "}",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const result = await sandbox.run(["flow", "workbench"], {
                fetcher: async () => new Response("", { status: 404 }),
            });

            expect(result.exitCode).toBe(0);
            expect(Reflect.get(globalThis, captureKey)).toBe(
                "No team is available to open the Open Flow Workbench for this account. Run `oo login` again, or select one with `oo team use <name>`.",
            );
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("returns a direct Workbench deep link for Open Flow Server", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");
        const captureKey = `open-flow-server-workbench-url-${Bun.randomUUIDv7()}`;

        try {
            await writeCommandEntry(commandDirectory, [
                "const catalogUrl = await host.getWorkbenchUrl();",
                "const flowUrl = await host.getWorkbenchUrl('flow/1');",
                `Reflect.set(globalThis, ${JSON.stringify(captureKey)}, { catalogUrl, flowUrl });`,
                "return 0;",
            ]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;
            sandbox.env.OO_OPEN_FLOW_TOKEN = "server-operator-token";
            sandbox.env.OO_OPEN_FLOW_URL = "https://flow.example.test:8443";

            let requestCount = 0;
            const result = await sandbox.run(["flow", "workbench", "flow/1"], {
                fetcher: async () => {
                    requestCount += 1;
                    return new Response(null, { status: 200 });
                },
            });

            expect(result.exitCode).toBe(0);
            expect(requestCount).toBe(0);
            expect(Reflect.get(globalThis, captureKey)).toEqual({
                catalogUrl: "https://flow.example.test:8443/flows",
                flowUrl: "https://flow.example.test:8443/flows/flow%2F1/design",
            });
        }
        finally {
            Reflect.deleteProperty(globalThis, captureKey);
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("keeps every delegated argument out of the debug log", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");

        try {
            await writeCommandEntry(commandDirectory, ["return 0;"]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const result = await sandbox.run([
                "flow",
                "run",
                "private/project.oo.yaml",
                "--connector-token",
                "secret-token",
            ]);
            const logContent = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(logContent).toContain("\"argv\":[\"flow\",\"<redacted>\"]");
            expect(logContent).not.toContain("private/project.oo.yaml");
            expect(logContent).not.toContain("secret-token");
        }
        finally {
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("reports when the pinned Open Flow release cannot be downloaded", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["flow", "--help"], {
                fetcher: () => Promise.resolve(new Response(null, { status: 404 })),
            });

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                `Downloading Open Flow ${openFlowCommandRelease.openFlowVersion}...`,
            );
            expect(result.stderr).toContain(
                `Open Flow ${openFlowCommandRelease.openFlowVersion} could not be downloaded or verified.`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders byte progress while downloading in an interactive terminal", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["flow", "--help"], {
                fetcher: () => Promise.resolve(new Response(null, { status: 404 })),
                stderr: { isTTY: true },
            });

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                `Downloading Open Flow ${openFlowCommandRelease.openFlowVersion}: 0 B / ${formatByteCount(openFlowCommandRelease.archive.length)} (0%)`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("loads a Cloud command entry without runtime Bun metadata", async () => {
        const sandbox = await createCliSandbox();
        const commandDirectory = await createTemporaryDirectory("oo-open-flow-command");

        try {
            await writeCommandEntry(commandDirectory, ["return 0;"]);
            sandbox.env.OO_OPEN_FLOW_COMMAND_DIR = commandDirectory;

            const result = await sandbox.run(["flow", "--version"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe("");
        }
        finally {
            await Promise.all([
                sandbox.cleanup(),
                rm(commandDirectory, { force: true, recursive: true }),
            ]);
        }
    });

    test("shows flow in root help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const defaultHelp = await sandbox.run(["--help"]);
            sandbox.env.OO_ENDPOINT = "oomol.com";
            const productionHelp = await sandbox.run(["--help"]);

            expect(defaultHelp.exitCode).toBe(0);
            expect(defaultHelp.stdout).toContain("  flow [args...]");
            expect(productionHelp.exitCode).toBe(0);
            expect(productionHelp.stdout).toContain("  flow [args...]");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("provides host-side flow help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const flowHelp = await sandbox.run(["help", "flow"]);

            expect(flowHelp.exitCode).toBe(0);
            expect(flowHelp.stdout).toContain("Arguments passed to Open Flow");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function writeCommandEntry(
    commandDirectory: string,
    body: readonly string[],
): Promise<void> {
    await mkdir(commandDirectory, { recursive: true });
    await writeFile(
        join(commandDirectory, "entry.js"),
        [
            "export const commandArtifactVersion = 2;",
            "export async function runOpenFlowCommand(args, host) {",
            ...body,
            "}",
            "",
        ].join("\n"),
    );
}
