import type { Logger } from "pino";

import type { CliInvocation } from "../bootstrap/run-cli.ts";
import type { AuthStore } from "../contracts/auth-store.ts";
import type { AppSettings } from "../schemas/settings.ts";
import type { TelemetryInvocationRecorder } from "./invocation.ts";
import type { TelemetryAccountState } from "./payload.ts";
import { arch, release } from "node:os";
import process from "node:process";
import { buildEnvApiKeyAccount } from "../auth/identity.ts";
import { getCurrentAuthAccount } from "../schemas/auth.ts";
import { detectInstallationMethodFromExecPath } from "../self-update/installation.ts";
import {
    telemetryInternalCommand,
    telemetryInternalEnvKey,
    telemetrySpawnIntervalMs,
    telemetrySpawnThresholdEvents,
} from "./constants.ts";
import { resolveTelemetryStatusFromSettingsFile } from "./control.ts";
import {
    countTelemetryEvents,
    enqueueTelemetryBatchItem,
    openTelemetryDatabase,
    readOrCreateTelemetryDeviceId,
    readTelemetryStateNumber,
    writeTelemetryStateNumber,
} from "./outbox.ts";
import { createCliCommandTelemetryPayload } from "./payload.ts";

export interface EmitCliTelemetryOptions {
    authStore?: AuthStore;
    buildCommit: string;
    env: Record<string, string | undefined>;
    execPath: string;
    exitCode: number;
    invocation: CliInvocation;
    logger: Logger;
    recorder: TelemetryInvocationRecorder;
    sessionId: string;
    settings?: AppSettings;
    settingsFilePath: string;
    startTimeMs: number;
    telemetryDirectoryPath: string;
    translatorLocale: string;
    version: string;
}

const ciEnvironmentDetectors = [
    { envKey: "GITHUB_ACTIONS", name: "github_actions" },
    { envKey: "GITLAB_CI", name: "gitlab_ci" },
    { envKey: "BUILDKITE", name: "buildkite" },
    { envKey: "CIRCLECI", name: "circleci" },
    { envKey: "CI", name: "ci" },
] as const;

export async function emitCliCommandTelemetry(
    options: EmitCliTelemetryOptions,
): Promise<void> {
    try {
        if (options.recorder.shouldSuppress()) {
            return;
        }

        const command = options.recorder.readCommand();

        if (command.excludeFromTelemetry === true) {
            return;
        }

        const status = await resolveTelemetryStatusFromSettingsFile({
            env: options.env,
            logger: options.logger,
            settings: options.settings,
            settingsFilePath: options.settingsFilePath,
        });

        if (!status.enabled) {
            return;
        }

        const nowMs = Date.now();
        const deviceId = await readOrCreateTelemetryDeviceId(
            options.telemetryDirectoryPath,
        );
        const ci = detectCiEnvironment(options.env);
        const uuid = Bun.randomUUIDv7();
        const payload = createCliCommandTelemetryPayload({
            accountState: await resolveTelemetryAccountState(
                options.authStore,
                options.env,
            ),
            arch: arch(),
            ciName: ci.name,
            cliCommit: options.buildCommit,
            cliInstallMethod: detectInstallationMethodFromExecPath({
                env: options.env,
                execPath: options.execPath,
                platform: process.platform,
            }).method,
            cliVersion: options.version,
            command,
            distinctId: deviceId.deviceId,
            durationMs: Math.max(0, nowMs - options.startTimeMs),
            isCi: ci.isCi,
            isFirstRun: deviceId.isFirstRun,
            isTtyStderr: options.invocation.stderr.isTTY === true,
            isTtyStdout: options.invocation.stdout.isTTY === true,
            lang: options.translatorLocale,
            os: process.platform,
            osVersion: release(),
            outcome: options.recorder.readOutcome(options.exitCode),
            runtimeVersion: Bun.version,
            sessionId: options.sessionId,
            timestamp: new Date(nowMs),
            uuid,
        });
        const inserted = enqueueTelemetryBatchItem({
            directoryPath: options.telemetryDirectoryPath,
            item: payload,
            logger: options.logger,
            nowMs,
        });

        if (inserted) {
            spawnTelemetryFlusherIfDue(options, nowMs);
        }
    }
    catch (error) {
        options.logger.debug(
            {
                err: error,
            },
            "Telemetry emit failed silently.",
        );
    }
}

function spawnTelemetryFlusherIfDue(
    options: EmitCliTelemetryOptions,
    nowMs: number,
): void {
    const database = openTelemetryDatabase(
        options.telemetryDirectoryPath,
        options.logger,
    );
    let shouldSpawn = false;

    try {
        const nextSpawnAfterMs = readTelemetryStateNumber(
            database,
            "next_spawn_after_ms",
        );

        if (nextSpawnAfterMs !== undefined && nextSpawnAfterMs > nowMs) {
            return;
        }

        const eventCount = countTelemetryEvents(database);

        shouldSpawn = eventCount >= telemetrySpawnThresholdEvents
            || nextSpawnAfterMs !== undefined;

        if (!shouldSpawn) {
            return;
        }

        writeTelemetryStateNumber(
            database,
            "next_spawn_after_ms",
            nowMs + telemetrySpawnIntervalMs,
        );
    }
    finally {
        database.close();
    }

    try {
        const subprocess = Bun.spawn({
            cmd: [options.execPath, telemetryInternalCommand],
            detached: true,
            env: {
                ...options.env,
                [telemetryInternalEnvKey]: "1",
            },
            stderr: "ignore",
            stdin: "ignore",
            stdout: "ignore",
            windowsHide: true,
        });

        subprocess.unref();
    }
    catch (error) {
        options.logger.debug(
            {
                err: error,
            },
            "Telemetry flusher spawn failed silently.",
        );
    }
}

async function resolveTelemetryAccountState(
    authStore: AuthStore | undefined,
    env: Record<string, string | undefined>,
): Promise<TelemetryAccountState> {
    // OO_API_KEY is an authenticated credential; report it as such without
    // reading auth.toml, matching the override's "never touch auth.toml" contract.
    if (buildEnvApiKeyAccount(env) !== undefined) {
        return "authenticated";
    }

    if (authStore === undefined) {
        return "unknown";
    }

    const { authFile, fileState } = await authStore.readTolerantState();

    if (fileState !== "ok") {
        // A missing file means nobody ever logged in; an unreadable one means
        // the account state cannot be known.
        return fileState === "missing" ? "anonymous" : "unknown";
    }

    return getCurrentAuthAccount(authFile) === undefined
        ? "anonymous"
        : "authenticated";
}

function detectCiEnvironment(
    env: Record<string, string | undefined>,
): { isCi: boolean; name: string } {
    for (const detector of ciEnvironmentDetectors) {
        if (env[detector.envKey] !== undefined && env[detector.envKey] !== "") {
            return {
                isCi: true,
                name: detector.name,
            };
        }
    }

    return {
        isCi: false,
        name: "none",
    };
}
