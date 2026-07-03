import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { ConnectorIdentity } from "./identity.ts";
import type {
    ConnectorActionAsyncLifecycle,
    ConnectorActionRunResponse,
    ConnectorConnectionSelector,
} from "./shared.ts";
import type { ConnectorTarget } from "./target.ts";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { getConfiguredIdentityOrganization } from "../../schemas/settings.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { readJsonInputValue } from "../shared/json-input.ts";
import { TerminalProgressRenderer } from "../shared/terminal-progress-renderer.ts";
import { resolveConnectorIdentity } from "./identity.ts";
import {
    deleteConnectorActionSchemaCache,
    isConnectorActionSchemaNotFoundError,
    loadConnectorActionSchema,
} from "./schema-cache.ts";
import {
    connectorFormatValues,
    requireConnectorActionName,
    runConnectorAction,
} from "./shared.ts";
import { resolveConnectorTarget } from "./target.ts";
import { recordConnectorFailureTelemetry } from "./telemetry.ts";
import { validateConnectorActionInput } from "./validation.ts";

const connectorRunExecutionIdColor = "#59F78D";

const connectorRunDataErrorKeys = {
    dataFilePathRequired: "errors.connectorRun.dataFilePathRequired",
    dataReadFailed: "errors.connectorRun.dataReadFailed",
    invalidDataJson: "errors.connectorRun.invalidDataJson",
} as const;

type ConnectorRunTextContext = Pick<CliExecutionContext, "stdout" | "translator">;
type ConnectorRunTarget = Pick<ConnectorRunInput, "serviceName"> & {
    actionName: string;
};
type ConnectorRunRequestTarget = Pick<
    ConnectorTarget,
    "authorization" | "baseUrl" | "kind"
>;
type ConnectorAsyncLifecycleProgressContext = Pick<CliExecutionContext, "stderr" | "translator">;
type ConnectorActionAsyncSubmitLifecycle = Extract<
    ConnectorActionAsyncLifecycle,
    { role: "submit" }
>;
type ConnectorActionAsyncResultLifecycle = Extract<
    ConnectorActionAsyncLifecycle,
    { role: "result" }
>;

const connectorAsyncLifecycleDefaultTimeoutMs = 6 * 3_600_000;

interface ConnectorRunInput {
    action?: string;
    connectionName?: string;
    data?: string;
    dryRun?: boolean;
    format?: (typeof connectorFormatValues)[number];
    organization?: string;
    personal?: boolean;
    serviceName: string;
    showSchemaVersion?: boolean;
    wait?: boolean;
    waitResult?: boolean;
}

export const connectorRunCommand: CliCommandDefinition<ConnectorRunInput> = {
    name: "run",
    summaryKey: "commands.connector.run.summary",
    descriptionKey: "commands.connector.run.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "serviceName",
            descriptionKey: "arguments.serviceName",
            required: true,
        },
    ],
    options: [
        {
            name: "action",
            longFlag: "--action",
            shortFlag: "-a",
            valueName: "action",
            descriptionKey: "options.action",
        },
        {
            name: "data",
            longFlag: "--data",
            shortFlag: "-d",
            aliasFlags: ["--input"],
            valueName: "data",
            descriptionKey: "options.data",
        },
        {
            name: "connectionName",
            longFlag: "--connection-name",
            valueName: "connection-name",
            descriptionKey: "options.connectorRunConnectionName",
        },
        {
            name: "dryRun",
            longFlag: "--dry-run",
            descriptionKey: "options.dryRun",
        },
        {
            name: "wait",
            longFlag: "--wait",
            descriptionKey: "options.connectorRunWait",
        },
        {
            name: "waitResult",
            longFlag: "--wait-result",
            descriptionKey: "options.connectorRunWaitResult",
        },
        {
            name: "organization",
            longFlag: "--organization",
            aliasFlags: ["--org"],
            valueName: "organization",
            descriptionKey: "options.connectorRunOrganization",
        },
        {
            name: "personal",
            longFlag: "--personal",
            descriptionKey: "options.connectorRunPersonal",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        action: z.string().optional(),
        connectionName: z.string().optional(),
        data: z.string().optional(),
        dryRun: z.boolean().optional(),
        format: z.enum(connectorFormatValues).optional(),
        organization: z.string().optional(),
        personal: z.boolean().optional(),
        serviceName: z.string(),
        showSchemaVersion: z.boolean().optional(),
        wait: z.boolean().optional(),
        waitResult: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const actionName = requireConnectorActionName(input.action);

        if (input.wait === true && input.waitResult === true) {
            throw new CliUserError("errors.connectorRun.waitModeConflict", 2);
        }

        if (input.personal === true && input.organization !== undefined) {
            throw new CliUserError("errors.connectorRun.identityConflict", 2);
        }

        const connectionName = input.connectionName?.trim();
        if (input.connectionName !== undefined && connectionName === "") {
            throw new CliUserError("errors.connectorRun.connectionNameEmpty", 2);
        }

        // The request layer sends this connection name on the wire as the
        // legacy `x-oo-connector-alias` header.
        const connectionSelector
            = connectionName === undefined ? undefined : { connectionName };
        const organizationFlag = input.organization?.trim();
        if (input.organization !== undefined && organizationFlag === "") {
            throw new CliUserError("errors.connectorRun.organizationEmpty", 2);
        }

        const target = await resolveConnectorTarget(context);

        // The self-hosted runtime is single-user and has no organization
        // concept: an explicit --organization is a hard error, while a
        // configured `identity.organization` default is silently ignored so a
        // shared config does not break self-hosted usage.
        if (target.kind === "self_hosted" && organizationFlag !== undefined) {
            throw new CliUserError("errors.connector.organizationUnsupported", 2);
        }

        const settings = await context.settingsStore.read();
        const { identity, source: identitySource } = target.kind === "self_hosted"
            ? { identity: {}, source: "personal" as const }
            : resolveConnectorIdentity({
                    configOrganization: getConfiguredIdentityOrganization(settings),
                    organizationFlag,
                    personalFlag: input.personal === true,
                });
        const inputData = await readJsonInputValue(
            input.data,
            context,
            connectorRunDataErrorKeys,
            {},
        );

        context.telemetry?.recordProperties({
            action: actionName,
            connection_selector: connectionSelector === undefined ? "none" : "connectionName",
            connector_kind: target.kind,
            data_size_bucket: bucketTelemetryBytes(
                Buffer.byteLength(JSON.stringify(inputData)),
            ),
            dry_run: input.dryRun === true,
            identity_source: identitySource,
            service: input.serviceName,
            wait: input.wait === true,
            wait_result: input.waitResult === true,
        });

        const actionSchema = await loadConnectorActionSchema(
            {
                actionName,
                requireAsyncLifecycle: input.wait === true || input.waitResult === true,
                serviceName: input.serviceName,
                target,
            },
            context,
        );

        let resultLifecycle: ConnectorActionAsyncResultLifecycle | undefined;
        let submitLifecycle: ConnectorActionAsyncSubmitLifecycle | undefined;
        if (input.wait === true) {
            if (actionSchema.asyncLifecycle?.role !== "result") {
                throw new CliUserError("errors.connectorRun.waitUnsupported", 2);
            }

            resultLifecycle = actionSchema.asyncLifecycle;
        }

        if (input.waitResult === true) {
            if (actionSchema.asyncLifecycle?.role !== "submit") {
                throw new CliUserError("errors.connectorRun.waitResultUnsupported", 2);
            }

            submitLifecycle = actionSchema.asyncLifecycle;
        }

        validateConnectorActionInput(inputData, actionSchema.inputSchema, context.translator);

        if (input.dryRun === true) {
            if (input.format === "json") {
                writeJsonOutput(context.stdout, {
                    dryRun: true,
                    ok: true,
                }, {
                    showSchemaVersion: input.showSchemaVersion,
                });
                return;
            }

            context.stdout.write(
                `${context.translator.t("connector.run.text.dryRunPassed")}\n`,
            );
            return;
        }

        let response: ConnectorActionRunResponse;
        let currentTarget: ConnectorRunTarget = {
            actionName,
            serviceName: input.serviceName,
        };
        if (submitLifecycle !== undefined) {
            const resultActionSchema = await loadConnectorActionSchema(
                {
                    actionName: submitLifecycle.resultAction,
                    requireAsyncLifecycle: true,
                    serviceName: input.serviceName,
                    target,
                },
                context,
            );

            if (resultActionSchema.asyncLifecycle?.role !== "result") {
                throw new CliUserError("errors.connectorRun.waitResultActionUnsupported", 2, {
                    action: submitLifecycle.resultAction,
                });
            }

            resultLifecycle = resultActionSchema.asyncLifecycle;
        }

        const progressReporter = resultLifecycle === undefined || input.format === "json"
            ? undefined
            : createConnectorAsyncLifecycleProgressReporter(context);

        try {
            response = await runConnectorActionWithDefaultMode(
                {
                    actionName,
                    connectionSelector,
                    identity,
                    inputData,
                    progressReporter,
                    resultLifecycle,
                    serviceName: input.serviceName,
                    submitLifecycle,
                    target,
                },
                context,
                (runTarget) => {
                    currentTarget = runTarget;
                },
            );
        }
        catch (error) {
            progressReporter?.abort();
            recordConnectorFailureTelemetry(error, context.telemetry);
            if (isConnectorActionSchemaNotFoundError(error)) {
                deleteConnectorActionSchemaCache(
                    {
                        accountId: target.cacheAccountId,
                        actionName: currentTarget.actionName,
                        endpoint: target.cacheEndpoint,
                        serviceName: currentTarget.serviceName,
                    },
                    context,
                );
            }
            throw error;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        context.stdout.write(
            `${formatConnectorRunResponseAsText(response, context)}\n`,
        );
    },
};

async function runConnectorActionWithDefaultMode(
    options: {
        actionName: string;
        connectionSelector: ConnectorConnectionSelector | undefined;
        identity: ConnectorIdentity;
        inputData: unknown;
        progressReporter: ConnectorAsyncLifecycleProgressReporter | undefined;
        resultLifecycle: ConnectorActionAsyncResultLifecycle | undefined;
        serviceName: string;
        submitLifecycle: ConnectorActionAsyncSubmitLifecycle | undefined;
        target: ConnectorRunRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    setCurrentTarget: (target: ConnectorRunTarget) => void,
): Promise<ConnectorActionRunResponse> {
    if (options.submitLifecycle !== undefined && options.resultLifecycle !== undefined) {
        return await runConnectorAsyncSubmitAndWaitForResult(
            {
                actionName: options.actionName,
                connectionSelector: options.connectionSelector,
                identity: options.identity,
                inputData: options.inputData,
                progressReporter: options.progressReporter,
                resultLifecycle: options.resultLifecycle,
                serviceName: options.serviceName,
                submitLifecycle: options.submitLifecycle,
                target: options.target,
            },
            context,
            setCurrentTarget,
        );
    }

    if (options.resultLifecycle !== undefined) {
        return await waitForConnectorAsyncResult(
            {
                actionName: options.actionName,
                connectionSelector: options.connectionSelector,
                identity: options.identity,
                inputData: options.inputData,
                lifecycle: options.resultLifecycle,
                progressReporter: options.progressReporter,
                serviceName: options.serviceName,
                target: options.target,
            },
            context,
            setCurrentTarget,
        );
    }

    setCurrentTarget({
        actionName: options.actionName,
        serviceName: options.serviceName,
    });

    return await runConnectorAction(
        {
            actionName: options.actionName,
            connectionSelector: options.connectionSelector,
            identity: options.identity,
            inputData: options.inputData,
            serviceName: options.serviceName,
            target: options.target,
        },
        context,
    );
}

async function runConnectorAsyncSubmitAndWaitForResult(
    options: {
        actionName: string;
        connectionSelector: ConnectorConnectionSelector | undefined;
        identity: ConnectorIdentity;
        inputData: unknown;
        progressReporter: ConnectorAsyncLifecycleProgressReporter | undefined;
        resultLifecycle: ConnectorActionAsyncResultLifecycle;
        serviceName: string;
        submitLifecycle: ConnectorActionAsyncSubmitLifecycle;
        target: ConnectorRunRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    setCurrentTarget: (target: ConnectorRunTarget) => void,
): Promise<ConnectorActionRunResponse> {
    setCurrentTarget({
        actionName: options.actionName,
        serviceName: options.serviceName,
    });

    const submitResponse = await runConnectorAction(
        {
            actionName: options.actionName,
            connectionSelector: options.connectionSelector,
            identity: options.identity,
            inputData: options.inputData,
            serviceName: options.serviceName,
            target: options.target,
        },
        context,
    );
    const handle = readObjectField(
        submitResponse.data,
        options.submitLifecycle.handle.outputField,
    );

    if (handle === undefined) {
        throw new CliUserError("errors.connectorRun.asyncHandleMissing", 1, {
            field: options.submitLifecycle.handle.outputField,
        });
    }

    const resultResponse = await waitForConnectorAsyncResult(
        {
            actionName: options.submitLifecycle.resultAction,
            connectionSelector: options.connectionSelector,
            identity: options.identity,
            inputData: {
                [options.submitLifecycle.handle.inputField]: handle,
            },
            lifecycle: options.resultLifecycle,
            progressReporter: options.progressReporter,
            serviceName: options.serviceName,
            target: options.target,
        },
        context,
        setCurrentTarget,
    );

    return {
        data: resultResponse.data,
        meta: {
            ...resultResponse.meta,
            handle,
            submitExecutionId: submitResponse.meta.executionId,
        },
    };
}

async function waitForConnectorAsyncResult(
    options: {
        actionName: string;
        connectionSelector: ConnectorConnectionSelector | undefined;
        identity: ConnectorIdentity;
        inputData: unknown;
        lifecycle: ConnectorActionAsyncResultLifecycle;
        progressReporter: ConnectorAsyncLifecycleProgressReporter | undefined;
        serviceName: string;
        target: ConnectorRunRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    setCurrentTarget: (target: ConnectorRunTarget) => void,
): Promise<ConnectorActionRunResponse> {
    const startedAt = Date.now();
    let pollCount = 0;
    const wait = options.lifecycle.wait;

    options.progressReporter?.startWaiting(options.actionName);

    while (true) {
        if (connectorAsyncLifecycleDefaultTimeoutMs - (Date.now() - startedAt) <= 0) {
            throw new CliUserError("errors.connectorRun.asyncTimedOut", 1, {
                action: options.actionName,
            });
        }

        setCurrentTarget({
            actionName: options.actionName,
            serviceName: options.serviceName,
        });

        const pollResponse = await runConnectorAction(
            {
                actionName: options.actionName,
                connectionSelector: options.connectionSelector,
                identity: options.identity,
                inputData: options.inputData,
                serviceName: options.serviceName,
                target: options.target,
            },
            context,
        );
        pollCount += 1;

        const state = readObjectField(pollResponse.data, wait.state.field);

        if (typeof state !== "string") {
            throw new CliUserError("errors.connectorRun.asyncStateMissing", 1, {
                field: wait.state.field,
            });
        }

        options.progressReporter?.reportPoll(
            options.actionName,
            pollCount,
            state,
        );

        if (wait.state.success.includes(state)) {
            const resultData = readConnectorAsyncLifecycleResult(
                pollResponse.data,
                wait.resultField,
            );

            options.progressReporter?.complete(options.actionName, pollCount);

            return {
                data: resultData,
                meta: {
                    ...pollResponse.meta,
                    pollAction: options.actionName,
                    pollCount,
                },
            };
        }

        if (wait.state.failure.includes(state)) {
            throw new CliUserError("errors.connectorRun.asyncFailed", 1, {
                state,
            });
        }

        if (!wait.state.running.includes(state)) {
            throw new CliUserError("errors.connectorRun.asyncUnknownState", 1, {
                state,
            });
        }

        const remainingMs = connectorAsyncLifecycleDefaultTimeoutMs
            - (Date.now() - startedAt);

        if (remainingMs <= 0) {
            throw new CliUserError("errors.connectorRun.asyncTimedOut", 1, {
                action: options.actionName,
            });
        }

        await Bun.sleep(Math.min(wait.intervalSeconds * 1000, remainingMs));
    }
}

function readConnectorAsyncLifecycleResult(
    data: unknown,
    resultField: string | undefined,
): unknown {
    if (resultField === undefined) {
        return data;
    }

    const result = readObjectField(data, resultField);

    if (result === undefined) {
        throw new CliUserError("errors.connectorRun.asyncResultMissing", 1, {
            field: resultField,
        });
    }

    return result;
}

function readObjectField(value: unknown, field: string): unknown {
    if (value === null || typeof value !== "object") {
        return undefined;
    }

    return (value as Record<string, unknown>)[field];
}

function createConnectorAsyncLifecycleProgressReporter(
    context: ConnectorAsyncLifecycleProgressContext,
): ConnectorAsyncLifecycleProgressReporter | undefined {
    if (context.stderr.isTTY !== true) {
        return undefined;
    }

    return new ConnectorAsyncLifecycleProgressReporter(
        context.stderr,
        context.translator,
    );
}

class ConnectorAsyncLifecycleProgressReporter extends TerminalProgressRenderer {
    private activeMessage: string | undefined;
    private completedMessage: string | undefined;
    private readonly colors;

    constructor(
        writer: CliExecutionContext["stderr"],
        private readonly translator: Pick<CliExecutionContext["translator"], "t">,
    ) {
        super(writer);
        this.colors = createWriterColors(writer);
    }

    startWaiting(action: string): void {
        this.completedMessage = undefined;
        this.activeMessage = this.translator.t(
            "connector.run.progress.waiting",
            { action },
        );
        this.startSpinner();
    }

    reportPoll(action: string, pollCount: number, state: string): void {
        this.activeMessage = this.translator.t(
            "connector.run.progress.polling",
            {
                action,
                pollCount,
                state,
            },
        );
        this.render();
    }

    complete(action: string, pollCount: number): void {
        this.activeMessage = undefined;
        this.completedMessage = this.translator.t(
            "connector.run.progress.completed",
            {
                action,
                pollCount,
            },
        );
        super.stop();
    }

    abort(): void {
        super.stop();
    }

    protected renderLines(): string[] {
        if (this.completedMessage !== undefined) {
            return [`${this.colors.green("◆")} ${this.completedMessage}`];
        }

        if (this.activeMessage !== undefined) {
            return [`${this.colors.cyan(this.currentFrame)} ${this.activeMessage}`];
        }

        return [""];
    }
}

function formatConnectorRunResponseAsText(
    response: ConnectorActionRunResponse,
    context: ConnectorRunTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    return [
        `${context.translator.t("connector.run.text.executionId")}: ${colors.hex(connectorRunExecutionIdColor)(response.meta.executionId)}`,
        colors.bold(`${context.translator.t("connector.run.text.resultData")}:`),
        formatConnectorRunResultData(response.data, colors),
    ].join("\n");
}

function formatConnectorRunResultData(
    value: unknown,
    colors: ReturnType<typeof createWriterColors>,
): string {
    return colors.cyan(JSON.stringify(value, null, 2) ?? "null");
}
