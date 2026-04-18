import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createFailedToOpenSocketError,
    expectCliUserError,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    getConnectorActionMetadata,
    listAuthenticatedConnectorServices,
    runConnectorAction,
    searchConnectorActions,
} from "./shared.ts";

describe("connector shared requests", () => {
    test("searchConnectorActions sends the expected request and parses actions", async () => {
        const requests: Request[] = [];
        const actions = await searchConnectorActions(
            {
                apiKey: "secret-1",
                endpoint: "oomol.com",
                keywords: ["gmail", "email"],
                text: "send mail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: [
                            {
                                description: "Send a Gmail message.",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                service: "gmail",
                            },
                        ],
                    }));
                },
            }),
        );

        expect(actions).toEqual([
            {
                description: "Send a Gmail message.",
                inputSchema: {
                    type: "object",
                },
                name: "send_mail",
                outputSchema: {
                    type: "object",
                },
                service: "gmail",
            },
        ]);
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://search.oomol.com/v1/connector-actions?q=send+mail&keywords=gmail%2Cemail",
        );
        expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
    });

    test("listAuthenticatedConnectorServices avoids a request when no services are provided", async () => {
        let fetchCount = 0;
        const services = await listAuthenticatedConnectorServices(
            {
                apiKey: "secret-1",
                endpoint: "oomol.com",
                services: [],
            },
            createRequestContext({
                fetcher: async () => {
                    fetchCount += 1;

                    return new Response("[]");
                },
            }),
        );

        expect([...services]).toEqual([]);
        expect(fetchCount).toBe(0);
    });

    test("getConnectorActionMetadata strips metadata-only fields", async () => {
        const action = await getConnectorActionMetadata(
            {
                actionName: "get_message",
                apiKey: "secret-1",
                endpoint: "oomol.com",
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    data: {
                        description: "Get one Gmail message.",
                        id: "action-1",
                        inputSchema: {
                            type: "object",
                        },
                        name: "get_message",
                        outputSchema: {
                            type: "object",
                        },
                        providerPermissions: ["gmail.readonly"],
                        requiredScopes: ["gmail.readonly"],
                        service: "gmail",
                    },
                })),
            }),
        );

        expect(action).toEqual({
            description: "Get one Gmail message.",
            inputSchema: {
                type: "object",
            },
            name: "get_message",
            outputSchema: {
                type: "object",
            },
            service: "gmail",
        });
    });

    test("runConnectorAction wraps request input and strips success fields from json output", async () => {
        const requests: Request[] = [];
        const response = await runConnectorAction(
            {
                actionName: "send_mail",
                apiKey: "secret-1",
                endpoint: "oomol.com",
                inputData: {
                    to: "foo@bar.com",
                },
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: {
                            messageId: "message-1",
                        },
                        message: "ok",
                        meta: {
                            executionId: "exec-1",
                        },
                        success: true,
                    }));
                },
            }),
        );

        expect(response).toEqual({
            data: {
                messageId: "message-1",
            },
            meta: {
                executionId: "exec-1",
            },
        });
        expect(requests).toHaveLength(1);
        await expect(requests[0]?.json()).resolves.toEqual({
            input: {
                to: "foo@bar.com",
            },
        });
    });

    test("runConnectorAction surfaces errorCode when the failure response omits a message", async () => {
        const error = await expectCliUserError(runConnectorAction(
            {
                actionName: "send_mail",
                apiKey: "secret-1",
                endpoint: "oomol.com",
                inputData: {
                    to: "foo@bar.com",
                },
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    errorCode: "invalid_input",
                    success: false,
                }), {
                    status: 400,
                }),
            }),
        ));

        expect(error.key).toBe("errors.connectorRun.requestFailedWithCode");
        expect(error.params).toEqual({
            errorCode: "invalid_input",
            status: 400,
        });
    });

    test("runConnectorAction appends the sandbox hint when the fetcher cannot open a socket", async () => {
        const error = await expectCliUserError(runConnectorAction(
            {
                actionName: "send_mail",
                apiKey: "secret-1",
                endpoint: "oomol.com",
                inputData: {},
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async () => {
                    throw createFailedToOpenSocketError("network down");
                },
            }),
        ));

        expect(error.key).toBe("errors.connectorRun.requestError");
        expect(error.params).toEqual({
            message:
                "network down\nCurrent environment may be running in a network-restricted sandbox. Try requesting elevated permissions.",
        });
    });
});

function createRequestContext(options: {
    fetcher: Fetcher;
}) {
    return {
        fetcher: options.fetcher,
        logger: pino({
            enabled: false,
        }),
        translator: createTranslator("en"),
    };
}
