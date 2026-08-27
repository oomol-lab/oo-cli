import type { Fetcher } from "../../contracts/cli.ts";

import type { ConnectorActionAsyncLifecycle } from "./shared.ts";
import { describe, expect, test } from "bun:test";

import pino from "pino";
import {
    createConnectorTargetFixture,
    createFailedToOpenSocketError,
    createSelfHostedConnectorTargetFixture,
    expectCliUserError,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    billingUrl,
    insufficientCreditErrorCode,
} from "../shared/billing.ts";
import {
    getConnectorActionMetadata,
    listConnectorAppsByService,
    runConnectorAction,
    runConnectorProxy,
    searchConnectorActions,
} from "./shared.ts";

describe("connector shared requests", () => {
    test("searchConnectorActions sends the expected request and parses actions", async () => {
        const requests: Request[] = [];
        const actions = await searchConnectorActions(
            {
                target: createConnectorTargetFixture(),
                text: "send mail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        success: true,
                        message: "ok",
                        data: [
                            {
                                accessStatus: "available",
                                authenticated: true,
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
                accessStatus: "available",
                authenticated: true,
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
            "https://connector.oomol.com/v1/actions/search?q=send+mail",
        );
        expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
    });

    test("searchConnectorActions accepts results without schema payloads", async () => {
        const actions = await searchConnectorActions(
            {
                target: createConnectorTargetFixture(),
                text: "send mail",
            },
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    success: true,
                    message: "ok",
                    data: [
                        {
                            authenticated: false,
                            name: "send_mail",
                            service: "gmail",
                        },
                    ],
                })),
            }),
        );

        expect(actions).toEqual([
            {
                accessStatus: "connection_required",
                authenticated: false,
                description: "",
                inputSchema: undefined,
                name: "send_mail",
                outputSchema: undefined,
                service: "gmail",
            },
        ]);
    });

    test("listConnectorAppsByService requests apps for one service", async () => {
        const requests: Request[] = [];
        const apps = await listConnectorAppsByService(
            {
                target: createConnectorTargetFixture(),
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: [
                            {
                                accountLabel: "user@example.com",
                                alias: "work",
                                aliasNormalized: "work",
                                authType: "oauth2",
                                createdAt: 1,
                                displayName: "Work Gmail",
                                id: "app-1",
                                isDefault: true,
                                providerAccountId: "acct-1",
                                scopes: ["gmail.send"],
                                service: "gmail",
                                status: "active",
                                updatedAt: 2,
                                userId: "user-1",
                            },
                        ],
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://connector.oomol.com/v1/apps/services/gmail",
        );
        expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        expect(apps).toHaveLength(1);
        expect(apps[0]).toMatchObject({
            connectionName: "work",
            displayName: "Work Gmail",
        });
    });

    test("listConnectorAppsByService maps missing connection names to null", async () => {
        const apps = await listConnectorAppsByService(
            {
                target: createConnectorTargetFixture(),
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    data: [
                        {
                            accountLabel: "user@example.com",
                            authType: null,
                            displayName: "Personal Gmail",
                            isDefault: false,
                            service: "gmail",
                            status: "active",
                        },
                    ],
                })),
            }),
        );

        expect(apps[0]?.connectionName).toBeNull();
    });

    test("listConnectorAppsByService rejects unsupported response envelopes", async () => {
        for (const body of ["{}", "{\"data\":{}}"]) {
            const error = await expectCliUserError(listConnectorAppsByService(
                {
                    target: createConnectorTargetFixture(),
                    serviceName: "gmail",
                },
                createRequestContext({
                    fetcher: async () => new Response(body),
                }),
            ));

            expect(error.key).toBe("errors.connectorApps.invalidResponse");
        }
    });

    test("getConnectorActionMetadata preserves metadata-only fields", async () => {
        const action = await getConnectorActionMetadata(
            {
                actionName: "get_message",
                target: createConnectorTargetFixture(),
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
        });
    });

    test("runConnectorAction wraps request input and strips success fields from json output", async () => {
        const requests: Request[] = [];
        const response = await runConnectorAction(
            {
                actionName: "send_mail",
                target: createConnectorTargetFixture(),
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

    test("runConnectorAction sends the team header for a team identity", async () => {
        const requests: Request[] = [];
        await runConnectorAction(
            {
                actionName: "send_mail",
                target: createConnectorTargetFixture(),
                identity: {
                    name: "acme",
                    id: null,
                    source: "account",
                    status: null,
                },
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
                        meta: {
                            executionId: "exec-1",
                        },
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://connector.oomol.com/v1/actions/gmail.send_mail",
        );
        expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
        expect(requests[0]?.headers.get("x-oo-team-id")).toBeNull();
    });

    test("runConnectorAction sends both identity headers for a completed identity", async () => {
        const requests: Request[] = [];
        await runConnectorAction(
            {
                actionName: "send_mail",
                target: createConnectorTargetFixture(),
                identity: {
                    name: "acme",
                    id: "team-1",
                    source: "env_name",
                    status: "valid",
                    envVar: "OO_TEAM_NAME",
                },
                inputData: {},
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: {},
                        meta: {
                            executionId: "exec-1",
                        },
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
        expect(requests[0]?.headers.get("x-oo-team-id")).toBe("team-1");
    });

    test("runConnectorAction sends only the id header for an id-only identity", async () => {
        const requests: Request[] = [];
        await runConnectorAction(
            {
                actionName: "send_mail",
                target: createConnectorTargetFixture(),
                identity: {
                    name: null,
                    id: "team-1",
                    source: "env_id",
                    status: "request_failed",
                    envVar: "OO_TEAM_ID",
                },
                inputData: {},
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: {},
                        meta: {
                            executionId: "exec-1",
                        },
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
        expect(requests[0]?.headers.get("x-oo-team-id")).toBe("team-1");
    });

    test("runConnectorAction sends the connection-name selector as a header without query params", async () => {
        const requests: Request[] = [];
        await runConnectorAction(
            {
                actionName: "send_mail",
                connectionSelector: {
                    connectionName: "work",
                },
                inputData: {
                    to: "foo@bar.com",
                },
                serviceName: "gmail",
                target: createConnectorTargetFixture(),
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: {
                            messageId: "message-1",
                        },
                        meta: {
                            executionId: "exec-1",
                        },
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://connector.oomol.com/v1/actions/gmail.send_mail",
        );
        expect(requests[0]?.headers.get("x-oo-connector-alias")).toBe("work");
    });

    test("runConnectorAction omits the team query and header for the personal identity", async () => {
        const requests: Request[] = [];
        await runConnectorAction(
            {
                actionName: "send_mail",
                target: createConnectorTargetFixture(),
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
                        meta: {
                            executionId: "exec-1",
                        },
                    }));
                },
            }),
        );

        expect(requests[0]?.url).toBe(
            "https://connector.oomol.com/v1/actions/gmail.send_mail",
        );
        expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
        expect(requests[0]?.headers.get("x-oo-team-id")).toBeNull();
    });

    test("getConnectorActionMetadata never sends a team query or header", async () => {
        const requests: Request[] = [];
        await getConnectorActionMetadata(
            {
                actionName: "get_message",
                target: createConnectorTargetFixture(),
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: {
                            description: "Get one Gmail message.",
                            inputSchema: {
                                type: "object",
                            },
                            name: "get_message",
                            outputSchema: {
                                type: "object",
                            },
                            service: "gmail",
                        },
                    }));
                },
            }),
        );

        expect(requests[0]?.url).toBe(
            "https://connector.oomol.com/v1/actions/gmail.get_message",
        );
        expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
        expect(requests[0]?.headers.get("x-oo-team-id")).toBeNull();
    });

    test("runConnectorProxy sends proxy requests with identity headers", async () => {
        const requests: Request[] = [];
        const response = await runConnectorProxy(
            {
                target: createConnectorTargetFixture(),
                identity: {
                    name: "acme",
                    id: null,
                    source: "account",
                    status: null,
                },
                proxyRequest: {
                    endpoint: "/search",
                    method: "GET",
                    query: {
                        q: "hello",
                    },
                },
                serviceName: "tavily",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: {
                            data: {
                                answer: "world",
                            },
                            headers: {
                                "content-type": "application/json",
                            },
                            status: 200,
                        },
                        message: "OK",
                        meta: {
                            executionId: "exec-1",
                            service: "tavily",
                        },
                        success: true,
                    }));
                },
            }),
        );

        expect(response).toEqual({
            data: {
                data: {
                    answer: "world",
                },
                headers: {
                    "content-type": "application/json",
                },
                status: 200,
            },
            meta: {
                executionId: "exec-1",
                service: "tavily",
            },
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe("https://connector.oomol.com/v1/proxy/tavily");
        expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
        await expect(requests[0]?.json()).resolves.toEqual({
            endpoint: "/search",
            method: "GET",
            query: {
                q: "hello",
            },
        });
    });

    test("runConnectorProxy accepts proxy responses without headers or data fields", async () => {
        const response = await runConnectorProxy(
            createProxyRunInput({
                proxyRequest: {
                    endpoint: "/empty",
                    method: "GET",
                },
            }),
            createProxyRequestContext(async () => new Response(JSON.stringify({
                data: {
                    status: 204,
                },
                meta: {
                    executionId: "exec-1",
                    service: "tavily",
                },
            }))),
        );

        expect(response).toEqual({
            data: {
                data: null,
                headers: {},
                status: 204,
            },
            meta: {
                executionId: "exec-1",
                service: "tavily",
            },
        });
    });

    // The run/proxy failure ladder is one shared implementation
    // (createConnectorFailureError); every case runs against both subjects so
    // the two key namespaces and their subject params cannot drift. The
    // status-only fallback also proves the ladder is total: no non-success
    // response escapes to a subject-less generic requestFailed.
    describe.each<{
        invoke: (fetcher: Fetcher) => Promise<unknown>;
        keyPrefix: string;
        subjectParams: Record<string, string>;
        title: string;
    }>([
        {
            invoke: fetcher => runConnectorAction(
                {
                    actionName: "send_mail",
                    inputData: {},
                    serviceName: "gmail",
                    target: createConnectorTargetFixture(),
                },
                createRequestContext({ fetcher }),
            ),
            keyPrefix: "errors.connectorRun",
            subjectParams: { action: "send_mail" },
            title: "runConnectorAction",
        },
        {
            invoke: fetcher => runConnectorProxy(
                createProxyRunInput(),
                createProxyRequestContext(fetcher),
            ),
            keyPrefix: "errors.connectorProxy",
            subjectParams: { service: "tavily" },
            title: "runConnectorProxy",
        },
    ])("$title failure ladder", ({ invoke, keyPrefix, subjectParams }) => {
        test("maps insufficient credit responses to the billing error", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    errorCode: insufficientCreditErrorCode,
                    message: "insufficient credit",
                    success: false,
                }),
                { status: 402 },
            )));

            expect(error.key).toBe("errors.billing.insufficientCredit");
            expect(error.params).toEqual({
                url: billingUrl,
            });
        });

        test("surfaces message and errorCode on a failed response", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    errorCode: "invalid_input",
                    message: "bad query",
                    success: false,
                }),
                { status: 400 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithMessageAndCode`);
            expect(error.params).toEqual({
                ...subjectParams,
                errorCode: "invalid_input",
                message: "bad query",
                status: 400,
            });
        });

        test("surfaces message when the failure response omits an errorCode", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    message: "denied by policy",
                    success: false,
                }),
                { status: 403 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithMessage`);
            expect(error.params).toEqual({
                ...subjectParams,
                message: "denied by policy",
                status: 403,
            });
        });

        test("surfaces errorCode when the failure response omits a message", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    errorCode: "invalid_input",
                    success: false,
                }),
                { status: 400 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithCode`);
            expect(error.params).toEqual({
                ...subjectParams,
                errorCode: "invalid_input",
                status: 400,
            });
        });

        test("maps the code and error aliases to errorCode and message", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    code: "POLICY_DENIED",
                    error: "access denied by policy",
                }),
                { status: 403 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithMessageAndCode`);
            expect(error.params).toEqual({
                ...subjectParams,
                errorCode: "POLICY_DENIED",
                message: "access denied by policy",
                status: 403,
            });
        });

        test("keeps the canonical message when an alias field is not a string", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    error: {
                        nested: true,
                    },
                    message: "access denied by policy",
                }),
                { status: 403 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithMessage`);
            expect(error.params).toEqual({
                ...subjectParams,
                message: "access denied by policy",
                status: 403,
            });
        });

        test("surfaces the raw body when the failure response is not a recognized envelope", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                "Forbidden by gateway",
                { status: 403 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithBody`);
            expect(error.params).toEqual({
                ...subjectParams,
                body: "Forbidden by gateway",
                status: 403,
            });
        });

        test("surfaces the raw body when the failure envelope has no message or errorCode", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                JSON.stringify({
                    success: false,
                }),
                { status: 500 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailedWithBody`);
            expect(error.params).toEqual({
                ...subjectParams,
                body: "{\"success\":false}",
                status: 500,
            });
        });

        test("surfaces status when the failure response body is empty", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                "",
                { status: 502 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailed`);
            expect(error.params).toEqual({
                ...subjectParams,
                status: 502,
            });
        });

        test("surfaces status when the failure response body is unreadable", async () => {
            const error = await expectCliUserError(invoke(async () => new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.error(new Error("body stream failed"));
                    },
                }),
                { status: 500 },
            )));

            expect(error.key).toBe(`${keyPrefix}.requestFailed`);
            expect(error.params).toEqual({
                ...subjectParams,
                status: 500,
            });
        });

        test("appends the sandbox hint when the fetcher cannot open a socket", async () => {
            const error = await expectCliUserError(invoke(async () => {
                throw createFailedToOpenSocketError("network down");
            }));

            expect(error.key).toBe(`${keyPrefix}.requestError`);
            expect(error.params).toEqual({
                message:
                    "network down\nCurrent environment may be running in a network-restricted sandbox. Try requesting elevated permissions.",
            });
        });
    });

    test("runConnectorProxy rejects unsupported success response envelopes", async () => {
        const error = await expectCliUserError(runConnectorProxy(
            createProxyRunInput(),
            createProxyRequestContext(async () => new Response(JSON.stringify({
                data: {
                    headers: {},
                },
                meta: {
                    executionId: "exec-1",
                    service: "tavily",
                },
            }))),
        ));

        expect(error.key).toBe("errors.connectorProxy.invalidResponse");
    });

    test("searchConnectorActions sends the Bearer token to a self-hosted target", async () => {
        const requests: Request[] = [];
        const actions = await searchConnectorActions(
            {
                target: createSelfHostedConnectorTargetFixture(),
                text: "send mail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        success: true,
                        data: [
                            {
                                authenticated: false,
                                description: "Send a Gmail message.",
                                name: "send_mail",
                                service: "gmail",
                            },
                        ],
                    }));
                },
            }),
        );

        expect(actions).toEqual([
            {
                accessStatus: "connection_required",
                authenticated: false,
                description: "Send a Gmail message.",
                inputSchema: undefined,
                name: "send_mail",
                outputSchema: undefined,
                service: "gmail",
            },
        ]);
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "http://localhost:3000/v1/actions/search?q=send+mail",
        );
        expect(requests[0]?.headers.get("Authorization")).toBe("Bearer oct_x");
    });

    test("searchConnectorActions omits the Authorization header when the target has no authorization", async () => {
        const requests: Request[] = [];

        await searchConnectorActions(
            {
                target: createSelfHostedConnectorTargetFixture({
                    authorization: undefined,
                }),
                text: "send mail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: [],
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.headers.get("Authorization")).toBeNull();
    });

    test("searchConnectorActions preserves a self-hosted base URL path prefix", async () => {
        const requests: Request[] = [];

        await searchConnectorActions(
            {
                target: createSelfHostedConnectorTargetFixture({
                    baseUrl: "http://host:9000/connect",
                }),
                text: "send mail",
            },
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        data: [],
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "http://host:9000/connect/v1/actions/search?q=send+mail",
        );
    });

    test("getConnectorActionMetadata normalizes a null asyncLifecycle to undefined", async () => {
        const action = await getConnectorActionMetadata(
            {
                actionName: "get_message",
                target: createSelfHostedConnectorTargetFixture(),
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    data: {
                        asyncLifecycle: null,
                        description: "Get one Gmail message.",
                        inputSchema: {
                            type: "object",
                        },
                        name: "get_message",
                        outputSchema: {
                            type: "object",
                        },
                        service: "gmail",
                    },
                })),
            }),
        );

        expect(action.asyncLifecycle).toBeUndefined();
    });

    test("getConnectorActionMetadata normalizes a connect-style asyncLifecycle shape to undefined", async () => {
        const action = await getConnectorActionMetadata(
            {
                actionName: "get_message",
                target: createSelfHostedConnectorTargetFixture(),
                serviceName: "gmail",
            },
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    data: {
                        asyncLifecycle: {
                            startActionId: "a",
                            statusActionId: "b",
                        },
                        description: "Get one Gmail message.",
                        inputSchema: {
                            type: "object",
                        },
                        name: "get_message",
                        outputSchema: {
                            type: "object",
                        },
                        service: "gmail",
                    },
                })),
            }),
        );

        expect(action.asyncLifecycle).toBeUndefined();
    });

    test("getConnectorActionMetadata preserves valid submit and result asyncLifecycle shapes", async () => {
        const validLifecycles: ConnectorActionAsyncLifecycle[] = [
            {
                handle: {
                    inputField: "task_id",
                    outputField: "id",
                },
                resultAction: "get_result",
                role: "submit",
            },
            {
                role: "result",
                wait: {
                    intervalSeconds: 2,
                    resultField: "output",
                    state: {
                        failure: ["failed"],
                        field: "status",
                        running: ["running"],
                        success: ["succeeded"],
                    },
                },
            },
        ];

        for (const asyncLifecycle of validLifecycles) {
            const action = await getConnectorActionMetadata(
                {
                    actionName: "get_message",
                    target: createConnectorTargetFixture(),
                    serviceName: "gmail",
                },
                createRequestContext({
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            asyncLifecycle,
                            description: "Get one Gmail message.",
                            inputSchema: {
                                type: "object",
                            },
                            name: "get_message",
                            outputSchema: {
                                type: "object",
                            },
                            service: "gmail",
                        },
                    })),
                }),
            );

            expect(action.asyncLifecycle).toEqual(asyncLifecycle);
        }
    });

    test("runConnectorAction reports the self-hosted URL without the sandbox hint when the server is unreachable", async () => {
        const error = await expectCliUserError(runConnectorAction(
            {
                actionName: "send_mail",
                target: createSelfHostedConnectorTargetFixture(),
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
        expect(error.params?.message).toContain("http://localhost:3000");
        expect(error.params?.message).not.toContain(
            "network-restricted sandbox",
        );
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

function createProxyRunInput(
    overrides: Partial<Parameters<typeof runConnectorProxy>[0]> = {},
): Parameters<typeof runConnectorProxy>[0] {
    return {
        target: createConnectorTargetFixture(),
        proxyRequest: {
            endpoint: "/search",
            method: "GET",
        },
        serviceName: "tavily",
        ...overrides,
    };
}

function createProxyRequestContext(fetcher: Fetcher): ReturnType<typeof createRequestContext> {
    return createRequestContext({ fetcher });
}
