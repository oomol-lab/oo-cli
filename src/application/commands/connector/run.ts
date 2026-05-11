import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type {
    ConnectorActionAsyncLifecycle,
    ConnectorActionRunResponse,
} from "./shared.ts";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { readJsonInputValue } from "../shared/json-input.ts";
import { TerminalProgressRenderer } from "../shared/terminal-progress-renderer.ts";
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
type ConnectorAsyncLifecycleProgressContext = Pick<CliExecutionContext, "stderr" | "translator">;

const connectorAsyncLifecycleDefaultTimeoutMs = 6 * 3_600_000;

interface ConnectorRunInput {
    action?: string;
    data?: string;
    dryRun?: boolean;
    format?: (typeof connectorFormatValues)[number];
    serviceName: string;
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
            valueName: "data",
            descriptionKey: "options.data",
        },
        {
            name: "dryRun",
            longFlag: "--dry-run",
            descriptionKey: "options.dryRun",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        action: z.string().optional(),
        data: z.string().optional(),
        dryRun: z.boolean().optional(),
        format: z.enum(connectorFormatValues).optional(),
        serviceName: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const actionName = requireConnectorActionName(input.action);

        const account = await requireCurrentAccount(context);
        const inputData = await readJsonInputValue(
            input.data,
            context,
            connectorRunDataErrorKeys,
            {},
        );

        context.telemetry?.recordProperties({
            action: actionName,
            data_size_bucket: bucketTelemetryBytes(
                Buffer.byteLength(JSON.stringify(inputData)),
            ),
            dry_run: input.dryRun === true,
            service: input.serviceName,
        });

        const actionSchema = await loadConnectorActionSchema(
            {
                actionName,
                account,
                serviceName: input.serviceName,
            },
            context,
        );

        validateConnectorActionInput(
            inputData,
            actionSchema.inputSchema,
            context.translator,
        );

        if (input.dryRun === true) {
            if (input.format === "json") {
                writeJsonOutput(context.stdout, {
                    dryRun: true,
                    ok: true,
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
        const progressReporter = input.format === "json"
            ? undefined
            : createConnectorAsyncLifecycleProgressReporter(context);

        try {
            response = await runConnectorActionWithDefaultMode(
                {
                    actionName,
                    apiKey: account.apiKey,
                    endpoint: account.endpoint,
                    inputData,
                    lifecycle: actionSchema.asyncLifecycle,
                    progressReporter,
                    serviceName: input.serviceName,
                },
                context,
                (target) => {
                    currentTarget = target;
                },
            );
        }
        catch (error) {
            progressReporter?.abort();
            recordConnectorRunFailureTelemetry(error, context.telemetry);
            if (isConnectorActionSchemaNotFoundError(error)) {
                deleteConnectorActionSchemaCache(
                    {
                        accountId: account.id,
                        actionName: currentTarget.actionName,
                        endpoint: account.endpoint,
                        serviceName: currentTarget.serviceName,
                    },
                    context,
                );
            }
            throw error;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response);
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
        apiKey: string;
        endpoint: string;
        inputData: unknown;
        lifecycle: ConnectorActionAsyncLifecycle | undefined;
        progressReporter: ConnectorAsyncLifecycleProgressReporter | undefined;
        serviceName: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    setCurrentTarget: (target: ConnectorRunTarget) => void,
): Promise<ConnectorActionRunResponse> {
    setCurrentTarget({
        actionName: options.actionName,
        serviceName: options.serviceName,
    });
    const response = await runConnectorAction(
        {
            actionName: options.actionName,
            apiKey: options.apiKey,
            endpoint: options.endpoint,
            inputData: options.inputData,
            serviceName: options.serviceName,
        },
        context,
    );

    if (options.lifecycle?.defaultRunMode !== "wait") {
        return response;
    }

    return await waitForConnectorAsyncLifecycle(
        {
            apiKey: options.apiKey,
            endpoint: options.endpoint,
            lifecycle: options.lifecycle,
            progressReporter: options.progressReporter,
            serviceName: options.serviceName,
            submitResponse: response,
        },
        context,
        setCurrentTarget,
    );
}

async function waitForConnectorAsyncLifecycle(
    options: {
        apiKey: string;
        endpoint: string;
        lifecycle: ConnectorActionAsyncLifecycle;
        progressReporter: ConnectorAsyncLifecycleProgressReporter | undefined;
        serviceName: string;
        submitResponse: ConnectorActionRunResponse;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    setCurrentTarget: (target: ConnectorRunTarget) => void,
): Promise<ConnectorActionRunResponse> {
    const handle = readObjectField(
        options.submitResponse.data,
        options.lifecycle.poll.handleOutputField,
    );

    if (handle === undefined) {
        throw new CliUserError("errors.connectorRun.asyncHandleMissing", 1, {
            field: options.lifecycle.poll.handleOutputField,
        });
    }

    const startedAt = Date.now();
    let pollCount = 0;

    options.progressReporter?.startWaiting(options.lifecycle.poll.action);

    while (true) {
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = connectorAsyncLifecycleDefaultTimeoutMs - elapsedMs;

        if (remainingMs <= 0) {
            throw new CliUserError("errors.connectorRun.asyncTimedOut", 1, {
                action: options.lifecycle.poll.action,
            });
        }

        setCurrentTarget({
            actionName: options.lifecycle.poll.action,
            serviceName: options.serviceName,
        });
        const pollResponse = await runConnectorAction(
            {
                actionName: options.lifecycle.poll.action,
                apiKey: options.apiKey,
                endpoint: options.endpoint,
                inputData: {
                    [options.lifecycle.poll.handleInputField]: handle,
                },
                serviceName: options.serviceName,
            },
            context,
        );
        pollCount += 1;

        const state = readObjectField(pollResponse.data, options.lifecycle.state.field);

        if (typeof state !== "string") {
            throw new CliUserError("errors.connectorRun.asyncStateMissing", 1, {
                field: options.lifecycle.state.field,
            });
        }

        options.progressReporter?.reportPoll(
            options.lifecycle.poll.action,
            pollCount,
            state,
        );

        if (options.lifecycle.state.success.includes(state)) {
            options.progressReporter?.complete(options.lifecycle.poll.action, pollCount);

            return {
                data: readConnectorAsyncLifecycleResult(
                    pollResponse.data,
                    options.lifecycle.resultField,
                ),
                meta: {
                    ...pollResponse.meta,
                    handle: String(handle),
                    pollAction: options.lifecycle.poll.action,
                    pollCount,
                    submitExecutionId: options.submitResponse.meta.executionId,
                },
            };
        }

        if (options.lifecycle.state.failure.includes(state)) {
            throw new CliUserError("errors.connectorRun.asyncFailed", 1, {
                state,
            });
        }

        if (!options.lifecycle.state.running.includes(state)) {
            throw new CliUserError("errors.connectorRun.asyncUnknownState", 1, {
                state,
            });
        }

        await Bun.sleep(
            Math.min(options.lifecycle.poll.intervalSeconds * 1000, remainingMs),
        );
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

function recordConnectorRunFailureTelemetry(
    error: unknown,
    telemetry: CliExecutionContext["telemetry"],
): void {
    if (!(error instanceof CliUserError)) {
        return;
    }

    const status = error.params?.status;
    const errorCode = error.params?.errorCode;
    const properties: { error_code?: string; http_status?: number } = {};

    if (typeof status === "number") {
        properties.http_status = status;
    }

    if (typeof errorCode === "string" && errorCode !== "") {
        properties.error_code = errorCode;
    }

    if (Object.keys(properties).length > 0) {
        telemetry?.recordProperties(properties);
    }
}
