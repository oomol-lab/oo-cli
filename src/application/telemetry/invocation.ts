import type {
    CliCommandFailedEvent,
    CliCommandObserver,
    CliParseErrorKind,
    CliTelemetryPropertyValue,
} from "../contracts/cli.ts";
import type {
    TelemetryCommandOutcome,
    TelemetryCommandSnapshot,
} from "./payload.ts";

export interface TelemetryInvocationRecorder {
    observer: CliCommandObserver;
    recordProperties: (
        properties: Record<string, CliTelemetryPropertyValue>,
    ) => void;
    readCommand: () => TelemetryCommandSnapshot;
    readOutcome: (fallbackExitCode: number) => TelemetryCommandOutcome;
    shouldSuppress: () => boolean;
    suppress: () => void;
}

interface MutableTelemetryInvocationState {
    command?: TelemetryCommandSnapshot;
    commanderCode?: string;
    errorKey?: string;
    exitCode?: number;
    parseErrorKind?: CliParseErrorKind;
    properties: Record<string, CliTelemetryPropertyValue>;
    suppress: boolean;
}

export function createTelemetryInvocationRecorder(): TelemetryInvocationRecorder {
    const state: MutableTelemetryInvocationState = {
        properties: {},
        suppress: false,
    };

    return {
        observer: {
            onCommandCompleted(event) {
                state.exitCode = event.exitCode;
            },
            onCommandFailed(event) {
                applyFailedEvent(state, event);
            },
            onCommandResolved(event) {
                state.command = {
                    ...resolveTelemetryCommandPath(event.commandPath),
                    argCount: event.argCount,
                    excludeFromTelemetry: event.excludeFromTelemetry,
                    flagsCount: event.flagsCount,
                    outputFormat: event.outputFormat,
                };
            },
            onParseError(event) {
                state.commanderCode = event.commanderCode;
                state.parseErrorKind = event.parseErrorKind;

                if (state.command === undefined) {
                    state.command = resolveParseTelemetryCommand(event.parseErrorKind);
                }
                else {
                    state.command = {
                        ...state.command,
                        parseErrorKind: event.parseErrorKind,
                    };
                }
            },
        },
        readCommand() {
            return {
                ...(state.command ?? resolveParseTelemetryCommand(state.parseErrorKind)),
                properties: state.properties,
            };
        },
        readOutcome(fallbackExitCode) {
            return {
                commanderCode: state.commanderCode,
                errorKey: state.errorKey,
                exitCode: state.exitCode ?? fallbackExitCode,
                parseErrorKind: state.parseErrorKind,
            };
        },
        shouldSuppress() {
            return state.suppress;
        },
        recordProperties(properties) {
            state.properties = {
                ...state.properties,
                ...properties,
            };
        },
        suppress() {
            state.suppress = true;
        },
    };
}

function applyFailedEvent(
    state: MutableTelemetryInvocationState,
    event: CliCommandFailedEvent,
): void {
    state.commanderCode = event.commanderCode;
    state.errorKey = event.errorKey;
    state.exitCode = event.exitCode;

    if (event.parseErrorKind !== undefined) {
        state.parseErrorKind = event.parseErrorKind;

        if (state.command === undefined) {
            state.command = resolveParseTelemetryCommand(event.parseErrorKind);
        }
    }
}

function resolveTelemetryCommandPath(
    commandPath: readonly string[],
): TelemetryCommandSnapshot {
    const commandGroup = commandPath[0] ?? "__parse__";

    if (commandPath.length <= 1) {
        return {
            commandAction: "__root__",
            commandFull: commandGroup,
            commandGroup,
        };
    }

    const commandAction = commandPath.at(-1) ?? "__root__";

    return {
        commandAction,
        commandFull: commandPath.join("."),
        commandGroup,
    };
}

function resolveParseTelemetryCommand(
    parseErrorKind: CliParseErrorKind | undefined,
): TelemetryCommandSnapshot {
    const commandAction = parseErrorKind ?? "__root__";

    return {
        commandAction,
        commandFull: `__parse__.${commandAction}`,
        commandGroup: "__parse__",
        parseErrorKind,
    };
}
