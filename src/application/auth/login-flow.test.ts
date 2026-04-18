import { describe, expect, test } from "bun:test";

import {
    createFailedToOpenSocketError,
    createLogCapture,
    toRequest,
} from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { startAuthLoginSession } from "./login-flow.ts";

describe("startAuthLoginSession", () => {
    test("creates a device login session and returns the verified account", async () => {
        const logCapture = createLogCapture();
        const requests: Request[] = [];
        let resultRequestCount = 0;

        try {
            const session = await startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    requests.push(request);

                    if (
                        request.method === "POST"
                        && requestUrl.pathname === "/v1/auth/device_login/code"
                    ) {
                        return new Response(JSON.stringify({
                            code: "M0KO41",
                            expires_in: 1800,
                            status: "waiting",
                            verify_code_url: "https://oomol.com/login/device",
                        }));
                    }

                    if (
                        request.method === "GET"
                        && requestUrl.pathname === "/v1/auth/device_login/result"
                    ) {
                        resultRequestCount += 1;

                        return new Response(JSON.stringify(resultRequestCount === 1
                            ? {
                                    status: "waiting",
                                }
                            : {
                                    api_key: "secret-1",
                                    endpoint: "oomol.com",
                                    id: "user-1",
                                    name: "Alice",
                                    status: "verified",
                                }));
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

            expect(session.code).toBe("M0KO41");
            expect(session.expiresInSeconds).toBe(1800);
            expect(session.verificationUrl).toBe("https://oomol.com/login/device");
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

        try {
            const session = await startAuthLoginSession({
                endpoint: "oomol.com",
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);
                    const requestUrl = new URL(request.url);

                    if (
                        request.method === "POST"
                        && requestUrl.pathname === "/v1/auth/device_login/code"
                    ) {
                        return new Response(JSON.stringify({
                            code: "M0KO41",
                            expires_in: 2,
                            status: "waiting",
                            verify_code_url: "https://oomol.com/login/device",
                        }));
                    }

                    if (
                        request.method === "GET"
                        && requestUrl.pathname === "/v1/auth/device_login/result"
                    ) {
                        return new Response(JSON.stringify({
                            status: "waiting",
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.method} ${requestUrl}`);
                },
                logger: logCapture.logger,
                now: () => nowMs,
                pollIntervalMs: 1_000,
                sleep: async (ms) => {
                    nowMs += ms;
                },
                translator: createTranslator("en"),
            });

            await expect(session.waitForAccount()).rejects.toMatchObject({
                key: "errors.auth.loginTimeout",
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
});
