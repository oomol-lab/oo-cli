import { describe, expect, test } from "bun:test";

import {
    createFailedToOpenSocketError,
    createLogCapture,
    toRequest,
} from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import {
    requestAuthAccountWithApiKey,
    requestAuthAccountWithSessionToken,
    startAuthLoginSession,
} from "./login-flow.ts";

describe("startAuthLoginSession", () => {
    test("creates a device login session and returns the verified account", async () => {
        const logCapture = createLogCapture();
        const requests: Request[] = [];
        let resultRequestCount = 0;

        try {
            const session = await startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    requests.push(request);

                    if (
                        request.method === "POST"
                        && requestUrl.pathname === "/v1/auth/device_login/code"
                    ) {
                        return Promise.resolve(new Response(JSON.stringify({
                            code: "M0KO41",
                            expires_in: 1800,
                            status: "waiting",
                            verify_code_url: "https://oomol.com/login/device?from=cli",
                        })));
                    }

                    if (
                        request.method === "GET"
                        && requestUrl.pathname === "/v1/auth/device_login/result"
                    ) {
                        resultRequestCount += 1;

                        return Promise.resolve(new Response(JSON.stringify(resultRequestCount === 1
                            ? {
                                    status: "waiting",
                                }
                            : {
                                    api_key: "secret-1",
                                    endpoint: "oomol.com",
                                    id: "user-1",
                                    name: "Alice",
                                    status: "verified",
                                })));
                    }

                    throw new Error(`Unexpected request: ${request.method} ${requestUrl}`);
                },
                logger: logCapture.logger,
                sleep: async () => {},
                translator: createTranslator("en"),
            });

            const account = await session.waitForAccount();
            const codeRequest = requests[0];
            const resultRequest = requests[1];
            const codeRequestBody = JSON.parse(await codeRequest!.text()) as {
                stat: string;
            };

            expect(session.expiresInSeconds).toBe(1800);
            expect(session.verificationUrl).toBe(
                "https://oomol.com/login/device?from=cli&user_code=M0KO41",
            );
            expect(account).toEqual({
                apiKey: "secret-1",
                endpoint: "oomol.com",
                id: "user-1",
                name: "Alice",
            });
            expect(codeRequest?.method).toBe("POST");
            expect(codeRequestBody.stat.length).toBe(36);
            expect(codeRequestBody.stat[14]).toBe("7");
            expect(resultRequest?.method).toBe("GET");
            expect(new URL(resultRequest!.url).searchParams.get("stat")).toBe(
                codeRequestBody.stat,
            );

            const logs = logCapture.read();

            expect(logs).toContain("\"msg\":\"Auth device login request started.\"");
            expect(logs).toContain("\"msg\":\"Auth device login completed successfully.\"");
            expect(logs).not.toContain("secret-1");
            expect(logs).not.toContain("M0KO41");
        }
        finally {
            logCapture.close();
        }
    });

    test("throws a user error when the device login code response is invalid", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: async () => new Response(JSON.stringify({
                    expires_in: 1800,
                    status: "waiting",
                    verify_code_url: "https://oomol.com/login/device",
                })),
                logger: logCapture.logger,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.loginInvalidResponse",
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("times out when the device login result never becomes verified", async () => {
        const logCapture = createLogCapture();
        let nowMs = 0;
        let resultRequestCount = 0;

        try {
            const session = await startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    if (
                        request.method === "POST"
                        && requestUrl.pathname === "/v1/auth/device_login/code"
                    ) {
                        return Promise.resolve(new Response(JSON.stringify({
                            code: "M0KO41",
                            expires_in: 2,
                            status: "waiting",
                            verify_code_url: "https://oomol.com/login/device",
                        })));
                    }

                    if (
                        request.method === "GET"
                        && requestUrl.pathname === "/v1/auth/device_login/result"
                    ) {
                        resultRequestCount += 1;

                        return Promise.resolve(new Response(JSON.stringify({
                            status: "waiting",
                        })));
                    }

                    throw new Error(`Unexpected request: ${request.method} ${requestUrl}`);
                },
                logger: logCapture.logger,
                now: () => nowMs,
                pollIntervalMs: 600_000,
                sleep: async (ms) => {
                    nowMs += ms;
                },
                translator: createTranslator("en"),
            });

            await expect(session.waitForAccount()).rejects.toMatchObject({
                key: "errors.auth.loginTimeout",
                params: {
                    timeout: "10m",
                },
            });
            expect(nowMs).toBe(600_000);
            expect(resultRequestCount).toBe(1);
        }
        finally {
            logCapture.close();
        }
    });

    test("times out a pending device login poll at the CLI wait timeout", async () => {
        const logCapture = createLogCapture();
        let nowMs = 0;

        try {
            const session = await startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    if (
                        request.method === "POST"
                        && requestUrl.pathname === "/v1/auth/device_login/code"
                    ) {
                        return Promise.resolve(new Response(JSON.stringify({
                            code: "M0KO41",
                            expires_in: 1800,
                            status: "waiting",
                            verify_code_url: "https://oomol.com/login/device",
                        })));
                    }

                    if (
                        request.method === "GET"
                        && requestUrl.pathname === "/v1/auth/device_login/result"
                    ) {
                        return new Promise<Response>(() => {});
                    }

                    throw new Error(`Unexpected request: ${request.method} ${requestUrl}`);
                },
                logger: logCapture.logger,
                now: () => nowMs,
                translator: createTranslator("en"),
            });

            nowMs = 599_999;

            await expect(session.waitForAccount()).rejects.toMatchObject({
                key: "errors.auth.loginTimeout",
                params: {
                    timeout: "10m",
                },
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("appends the sandbox hint when the device login fetcher cannot open a socket", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: async () => {
                    throw createFailedToOpenSocketError("network down");
                },
                logger: logCapture.logger,
                translator: createTranslator("zh"),
            })).rejects.toMatchObject({
                key: "errors.auth.loginRequestError",
                params: {
                    message:
                        "network down\n当前环境可能在网络受限的沙箱中，请尝试提权。",
                },
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("requests a fast login profile with a session token", async () => {
        const logCapture = createLogCapture();
        const endpoint = "example.test";
        const requests: Request[] = [];

        try {
            const account = await requestAuthAccountWithSessionToken({
                endpoint,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    requests.push(request);

                    if (
                        request.method === "GET"
                        && requestUrl.host === `api.${endpoint}`
                        && requestUrl.pathname === "/v1/auth/fast_login/profile_with_session_token"
                        && requestUrl.searchParams.get("session_token") === "session-1"
                    ) {
                        return new Response(JSON.stringify({
                            api_key: "secret-1",
                            endpoint,
                            id: "0193438c-238f-703c-8754-e4a04e0be0c1",
                            name: "Alice",
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.method} ${requestUrl}`);
                },
                logger: logCapture.logger,
                sessionToken: "session-1",
                translator: createTranslator("en"),
            });

            expect(requests).toHaveLength(1);
            expect(account).toEqual({
                apiKey: "secret-1",
                endpoint,
                id: "0193438c-238f-703c-8754-e4a04e0be0c1",
                name: "Alice",
            });

            const request = requests[0];

            expect(request?.method).toBe("GET");
            expect(new URL(request!.url).searchParams.get("session_token")).toBe(
                "session-1",
            );

            const logs = logCapture.read();

            expect(logs).toContain("\"msg\":\"Auth fast login request started.\"");
            expect(logs).toContain("\"msg\":\"Auth fast login completed successfully.\"");
            expect(logs).not.toContain("session-1");
            expect(logs).not.toContain("secret-1");
        }
        finally {
            logCapture.close();
        }
    });

    test("redacts the session token from fast login failures", async () => {
        const logCapture = createLogCapture();
        const endpoint = "example.test";
        const sessionToken = "token with/sensitive value";
        const encodedSessionToken = encodeURIComponent(sessionToken);
        const searchEncodedSessionToken = new URLSearchParams({
            session_token: sessionToken,
        }).toString().slice("session_token=".length);

        try {
            await expect(requestAuthAccountWithSessionToken({
                endpoint,
                fetcher: async () => {
                    throw new Error(
                        `Failed to fetch https://api.${endpoint}/v1/auth/fast_login/profile_with_session_token?session_token=${searchEncodedSessionToken}`,
                    );
                },
                logger: logCapture.logger,
                sessionToken,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.loginRequestError",
                params: {
                    message:
                        `Failed to fetch https://api.${endpoint}/v1/auth/fast_login/profile_with_session_token?session_token=<redacted>`,
                },
            });

            const logs = logCapture.read();

            expect(logs).not.toContain(sessionToken);
            expect(logs).not.toContain(encodedSessionToken);
            expect(logs).not.toContain(searchEncodedSessionToken);
            expect(logs).toContain("session_token=<redacted>");
        }
        finally {
            logCapture.close();
        }
    });
});

describe("requestAuthAccountWithApiKey", () => {
    test("resolves an account from the users profile endpoint", async () => {
        const logCapture = createLogCapture();
        const endpoint = "example.test";
        const apiKey = "api-key-1";
        const requests: Request[] = [];

        try {
            const account = await requestAuthAccountWithApiKey({
                apiKey,
                endpoint,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    requests.push(request);

                    if (
                        request.method === "GET"
                        && requestUrl.host === `api.${endpoint}`
                        && requestUrl.pathname === "/v1/users/profile"
                        && request.headers.get("Authorization") === apiKey
                    ) {
                        return new Response(JSON.stringify({
                            displayname: "Kevin Cui",
                            email: "bh@bugs.cc",
                            nickname: "Kevin Cui",
                            uid: "019343c2-c43d-710f-81b2-dfa68d3079de",
                            username: "BlackHole1",
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.method} ${requestUrl}`);
                },
                logger: logCapture.logger,
                translator: createTranslator("en"),
            });

            expect(requests).toHaveLength(1);
            expect(account).toEqual({
                apiKey,
                endpoint,
                id: "019343c2-c43d-710f-81b2-dfa68d3079de",
                name: "BlackHole1",
            });

            const request = requests[0];

            expect(request?.method).toBe("GET");
            expect(request?.url).toBe(`https://api.${endpoint}/v1/users/profile`);

            const logs = logCapture.read();

            expect(logs).toContain("\"msg\":\"Auth api key login request started.\"");
            expect(logs).toContain("\"msg\":\"Auth api key login completed successfully.\"");
            expect(logs).not.toContain(apiKey);
        }
        finally {
            logCapture.close();
        }
    });

    test("throws an invalid api key error when the profile request is unauthorized", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(requestAuthAccountWithApiKey({
                apiKey: "api-key-1",
                endpoint: "example.test",
                fetcher: async () => new Response(null, { status: 401 }),
                logger: logCapture.logger,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.apiKeyInvalid",
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("throws an invalid api key error when the profile request is forbidden", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(requestAuthAccountWithApiKey({
                apiKey: "api-key-1",
                endpoint: "example.test",
                fetcher: async () => new Response(null, { status: 403 }),
                logger: logCapture.logger,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.apiKeyInvalid",
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("throws a generic request error when the profile request fails with a server error", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(requestAuthAccountWithApiKey({
                apiKey: "api-key-1",
                endpoint: "example.test",
                fetcher: async () => new Response(null, { status: 500 }),
                logger: logCapture.logger,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.loginRequestFailed",
                params: {
                    status: 500,
                },
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("throws an invalid response error when the profile body is unsupported", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(requestAuthAccountWithApiKey({
                apiKey: "api-key-1",
                endpoint: "example.test",
                fetcher: async () => new Response(JSON.stringify({
                    username: "BlackHole1",
                })),
                logger: logCapture.logger,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.loginInvalidResponse",
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("redacts the api key from profile request failures", async () => {
        const logCapture = createLogCapture();
        const endpoint = "example.test";
        const apiKey = "super-secret-api-key";

        try {
            await expect(requestAuthAccountWithApiKey({
                apiKey,
                endpoint,
                fetcher: async () => {
                    throw new Error(
                        `Failed to fetch https://api.${endpoint}/v1/users/profile with Authorization ${apiKey}`,
                    );
                },
                logger: logCapture.logger,
                translator: createTranslator("en"),
            })).rejects.toMatchObject({
                key: "errors.auth.loginRequestError",
                params: {
                    message:
                        `Failed to fetch https://api.${endpoint}/v1/users/profile with Authorization <redacted>`,
                },
            });

            const logs = logCapture.read();

            expect(logs).not.toContain(apiKey);
        }
        finally {
            logCapture.close();
        }
    });
});
