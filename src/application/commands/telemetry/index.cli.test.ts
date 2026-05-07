import { chmod, mkdir, truncate } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
    createCliSnapshot,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { createTelemetryItemForTest } from "../../telemetry/__tests__/helpers.ts";
import {
    telemetryDatabaseMaxBytes,
    telemetrySpawnIntervalMs,
    telemetrySpawnThresholdEvents,
} from "../../telemetry/constants.ts";
import {
    enqueueTelemetryBatchItem,
    leaseReadyTelemetryRows,
    openTelemetryDatabase,
    parseTelemetryRowPayload,
    readOrCreateTelemetryDeviceId,
    readTelemetryDeviceIdIfExists,
    readTelemetryRowsForTest,
    readTelemetryStateNumber,
    resolveTelemetryDatabaseFilePath,
    writeTelemetryStateNumber,
} from "../../telemetry/outbox.ts";

const posixTest = process.platform === "win32" ? test.skip : test;

describe("telemetry CLI", () => {
    test("shows default status without creating a device id or telemetry event", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["telemetry", "status"]);
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).toContain("enabled: true");
            expect(result.stdout).toContain("device_id: none");
            expect(result.stdout).toContain("pending: 0");
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("shows the last successful flush timestamp", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const lastFlushAtMs = Date.UTC(2026, 0, 2, 3, 4, 5, 678);
            const database = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                writeTelemetryStateNumber(
                    database,
                    "last_flush_at_ms",
                    lastFlushAtMs,
                );
            }
            finally {
                database.close();
            }

            const status = await sandbox.run(["telemetry", "status"]);

            expect(status.exitCode).toBe(0);
            expect(status.stdout).toContain("pending: 0");
            expect(status.stdout).toContain("last_flush: 2026-01-02T03:04:05.678Z");
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records generic command telemetry in the outbox", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["config", "list"]);
            const rows = readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            );
            const payload = parseTelemetryRowPayload(rows[0]!);

            expect(result.exitCode).toBe(0);
            expect(rows).toHaveLength(1);
            expect(payload).toMatchObject({
                event: "cli_command_executed",
                properties: {
                    $geoip_disable: true,
                    $ip: "",
                    $process_person_profile: false,
                    account_state: "anonymous",
                    ci_name: "none",
                    command_action: "list",
                    command_full: "config.list",
                    command_group: "config",
                    distinct_id: expect.any(String),
                    exit_code: 0,
                    is_ci: false,
                    success: true,
                },
            });
            expect(payload).not.toHaveProperty("distinct_id");
            expect(payload?.properties).not.toHaveProperty("$set");
            expect(payload?.properties).not.toHaveProperty("$identify");
            expect(payload?.properties).not.toHaveProperty("user_id");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records CI environment without changing device-level identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.GITHUB_ACTIONS = "true";

            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const command = await sandbox.run(["config", "list"]);
            const rows = readTelemetryRowsForTest(telemetryDirectoryPath);
            const payload = parseTelemetryRowPayload(rows[0]!);
            const deviceId = await readTelemetryDeviceIdIfExists(
                telemetryDirectoryPath,
            );

            expect(command.exitCode).toBe(0);
            expect(payload).toMatchObject({
                properties: {
                    ci_name: "github_actions",
                    is_ci: true,
                },
            });
            expect(payload?.properties.distinct_id).toBe(deviceId);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records authenticated account state without account identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        apiKey: "private-auth-token",
                        endpoint: "private.example.internal",
                        id: "private-account-id",
                        name: "Private Account Name",
                    },
                ],
            });

            const command = await sandbox.run(["config", "list"]);
            const rows = readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            );
            const payload = parseTelemetryRowPayload(rows[0]!);
            const serializedPayload = JSON.stringify(payload);

            expect(command.exitCode).toBe(0);
            expect(payload).toMatchObject({
                properties: {
                    account_state: "authenticated",
                },
            });
            expect(payload?.properties).not.toHaveProperty("account_id");
            expect(payload?.properties).not.toHaveProperty("account_name");
            expect(payload?.properties).not.toHaveProperty("user_id");
            expect(serializedPayload).not.toContain("private-account-id");
            expect(serializedPayload).not.toContain("Private Account Name");
            expect(serializedPayload).not.toContain("private-auth-token");
            expect(serializedPayload).not.toContain("private.example.internal");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records safe command-specific telemetry properties", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            const config = await sandbox.run(["config", "set", "lang", "en"]);
            const completion = await sandbox.run(["completion", "bash"]);
            const rows = readTelemetryRowsForTest(telemetryDirectoryPath);
            const payloads = rows.map(row => parseTelemetryRowPayload(row));

            expect(config.exitCode).toBe(0);
            expect(completion.exitCode).toBe(0);
            expect(payloads).toMatchObject([
                {
                    properties: {
                        command_full: "config.set",
                        config_key: "lang",
                    },
                },
                {
                    properties: {
                        command_full: "completion",
                        shell: "bash",
                    },
                },
            ]);
            expect(payloads[0]?.properties).not.toHaveProperty("value");
            expect(payloads[0]?.properties).not.toHaveProperty("config_value");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records safe auth telemetry properties without account identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            const authStatus = await sandbox.run(["auth", "status"]);
            const rows = readTelemetryRowsForTest(telemetryDirectoryPath);
            const payload = parseTelemetryRowPayload(rows[0]!);

            expect(authStatus.exitCode).toBe(0);
            expect(payload).toMatchObject({
                properties: {
                    account_count_bucket: "0",
                    command_full: "auth.status",
                },
            });
            expect(payload?.properties).not.toHaveProperty("account_id");
            expect(payload?.properties).not.toHaveProperty("account_name");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not record telemetry commands themselves", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            await sandbox.run(["config", "list"]);
            const beforeRows = readTelemetryRowsForTest(telemetryDirectoryPath);
            const status = await sandbox.run(["telemetry", "status"]);
            const afterRows = readTelemetryRowsForTest(telemetryDirectoryPath);

            expect(status.stdout).toContain(`pending: ${beforeRows.length}`);
            expect(afterRows).toHaveLength(beforeRows.length);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports telemetry enable and disable commands", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const deviceId = await readOrCreateTelemetryDeviceId(
                telemetryDirectoryPath,
            );

            await sandbox.run(["config", "list"]);
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toHaveLength(1);

            const disable = await sandbox.run(["telemetry", "disable"]);
            const disabledStatus = await sandbox.run(["telemetry", "status"]);
            const enable = await sandbox.run(["telemetry", "enable"]);
            const enabledStatus = await sandbox.run(["telemetry", "status"]);

            expect(createCliSnapshot(disable)).toMatchSnapshot();
            expect(createCliSnapshot(enable)).toMatchSnapshot();
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
            expect(await readTelemetryDeviceIdIfExists(telemetryDirectoryPath)).toBe(
                deviceId.deviceId,
            );
            expect(disabledStatus.stdout).toContain("enabled: false (config)");
            expect(enabledStatus.stdout).toContain("enabled: true");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports telemetry.enabled through config commands", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            await sandbox.run(["config", "list"]);
            const setFalse = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "false",
            ]);
            const rowsAfterSetFalse = readTelemetryRowsForTest(
                telemetryDirectoryPath,
            );
            const getFalse = await sandbox.run([
                "config",
                "get",
                "telemetry.enabled",
            ]);
            const listFalse = await sandbox.run(["config", "list"]);
            const invalid = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "True",
            ]);
            const invalidNumber = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "1",
            ]);
            const invalidWord = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "yes",
            ]);
            const setTrue = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "true",
            ]);
            const unset = await sandbox.run([
                "config",
                "unset",
                "telemetry.enabled",
            ]);
            const getUnset = await sandbox.run([
                "config",
                "get",
                "telemetry.enabled",
            ]);
            const listUnset = await sandbox.run(["config", "list"]);

            expect(createCliSnapshot(setFalse)).toMatchSnapshot();
            expect(createCliSnapshot(getFalse)).toMatchSnapshot();
            expect(createCliSnapshot(listFalse)).toMatchSnapshot();
            expect(createCliSnapshot(invalid)).toMatchSnapshot();
            expect(createCliSnapshot(setTrue)).toMatchSnapshot();
            expect(createCliSnapshot(unset)).toMatchSnapshot();
            expect(rowsAfterSetFalse).toEqual([]);
            expect(getFalse.stdout).toBe("false\n");
            expect(getUnset.stdout).toBe("");
            expect(listUnset.stdout).not.toContain("telemetry.enabled=");
            expect(listFalse.stdout).toContain("telemetry.enabled=false");
            expect(invalid.stderr).toContain("Invalid telemetry.enabled value");
            expect(invalidNumber.stderr).toContain("Invalid telemetry.enabled value");
            expect(invalidWord.stderr).toContain("Invalid telemetry.enabled value");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not purge pending telemetry when telemetry is enabled or unset", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            enqueueTelemetryBatchItem({
                directoryPath: telemetryDirectoryPath,
                item: createTelemetryItemForTest(1),
                nowMs: 1,
            });
            const initialRowId = readTelemetryRowsForTest(telemetryDirectoryPath)[0]!
                .id;

            const enable = await sandbox.run(["telemetry", "enable"]);
            const rowsAfterEnable = readTelemetryRowsForTest(telemetryDirectoryPath);
            const setTrue = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "true",
            ]);
            const rowsAfterSetTrue = readTelemetryRowsForTest(telemetryDirectoryPath);
            const unset = await sandbox.run([
                "config",
                "unset",
                "telemetry.enabled",
            ]);
            const rowsAfterUnset = readTelemetryRowsForTest(telemetryDirectoryPath);

            expect(enable.exitCode).toBe(0);
            expect(setTrue.exitCode).toBe(0);
            expect(unset.exitCode).toBe(0);
            expect(rowsAfterEnable.map(row => row.id)).toContain(initialRowId);
            expect(rowsAfterSetTrue.map(row => row.id)).toContain(initialRowId);
            expect(rowsAfterUnset.map(row => row.id)).toContain(initialRowId);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("purges leased pending telemetry when disabled through config", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            enqueueTelemetryBatchItem({
                directoryPath: telemetryDirectoryPath,
                item: createTelemetryItemForTest(1),
                nowMs: 1,
            });

            const database = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                expect(leaseReadyTelemetryRows(database, Date.now())).toHaveLength(1);
            }
            finally {
                database.close();
            }

            const disable = await sandbox.run([
                "config",
                "set",
                "telemetry.enabled",
                "false",
            ]);

            expect(disable.exitCode).toBe(0);
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps disable commands successful when the telemetry outbox is locked", async () => {
        const cases = [
            ["telemetry", "disable"],
            ["config", "set", "telemetry.enabled", "false"],
        ] as const;

        for (const argv of cases) {
            const sandbox = await createCliSandbox();

            try {
                const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

                enqueueTelemetryBatchItem({
                    directoryPath: telemetryDirectoryPath,
                    item: createTelemetryItemForTest(1),
                    nowMs: 1,
                });

                const database = openTelemetryDatabase(telemetryDirectoryPath);

                try {
                    database.run("BEGIN IMMEDIATE");

                    const disable = await sandbox.run([...argv]);

                    expect(disable.exitCode).toBe(0);
                    expect(disable.stderr).toBe("");
                }
                finally {
                    database.run("ROLLBACK");
                    database.close();
                }

                const status = await sandbox.run(["telemetry", "status"]);

                expect(status.stdout).toContain("enabled: false (config)");
                expect(status.stdout).toContain("pending: 1");
                expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toHaveLength(1);
            }
            finally {
                await sandbox.cleanup();
            }
        }
    });

    test("honors environment opt-out", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.OO_TELEMETRY_DISABLED = "1";

            const command = await sandbox.run(["config", "list"]);
            const status = await sandbox.run(["telemetry", "status"]);

            expect(command.exitCode).toBe(0);
            expect(status.stdout).toContain("enabled: false (env)");
            expect(readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            )).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("honors do-not-track opt-out", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.DO_NOT_TRACK = "1";

            const command = await sandbox.run(["config", "list"]);
            const status = await sandbox.run(["telemetry", "status"]);

            expect(command.exitCode).toBe(0);
            expect(status.stdout).toContain("enabled: false (env)");
            expect(readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            )).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("honors documented telemetry opt-out truthy values", async () => {
        const cases = [
            {
                envKey: "OO_TELEMETRY_DISABLED",
                envValue: "true",
            },
            {
                envKey: "OO_TELEMETRY_DISABLED",
                envValue: "ON",
            },
            {
                envKey: "DO_NOT_TRACK",
                envValue: " yes ",
            },
        ] as const;

        for (const testCase of cases) {
            const sandbox = await createCliSandbox();

            try {
                sandbox.env[testCase.envKey] = testCase.envValue;

                const command = await sandbox.run(["config", "list"]);
                const status = await sandbox.run(["telemetry", "status"]);

                expect(command.exitCode).toBe(0);
                expect(status.stdout).toContain("enabled: false (env)");
                expect(readTelemetryRowsForTest(
                    resolveSandboxTelemetryDirectory(sandbox),
                )).toEqual([]);
            }
            finally {
                await sandbox.cleanup();
            }
        }
    });

    test("counts leased rows as pending telemetry", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            await sandbox.run(["config", "list"]);

            const database = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                expect(leaseReadyTelemetryRows(database, Date.now())).toHaveLength(1);
            }
            finally {
                database.close();
            }

            const status = await sandbox.run(["telemetry", "status"]);

            expect(status.stdout).toContain("pending: 1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps commands successful when the telemetry database is locked", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const database = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                database.run("BEGIN IMMEDIATE");

                const command = await sandbox.run(["config", "list"]);

                expect(command.exitCode).toBe(0);
                expect(command.stderr).toBe("");
            }
            finally {
                database.run("ROLLBACK");
                database.close();
            }

            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps commands successful when the telemetry database is corrupt", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);

            await mkdir(telemetryDirectoryPath, { recursive: true });
            await Bun.write(
                resolveTelemetryDatabaseFilePath(telemetryDirectoryPath),
                "not sqlite",
            );

            const command = await sandbox.run(["config", "list"]);

            expect(command.exitCode).toBe(0);
            expect(command.stderr).toBe("");
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toHaveLength(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("drops telemetry without affecting commands when the outbox is over the hard limit", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const databaseFilePath = resolveTelemetryDatabaseFilePath(
                telemetryDirectoryPath,
            );

            await mkdir(telemetryDirectoryPath, { recursive: true });
            await Bun.write(databaseFilePath, "");
            await truncate(databaseFilePath, telemetryDatabaseMaxBytes);

            const command = await sandbox.run(["config", "list"]);

            expect(command.exitCode).toBe(0);
            expect(command.stderr).toBe("");
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    posixTest("defers flusher spawn while the outbox is below threshold", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const markerPath = join(sandbox.cwd, "spawn-marker");
            const execPath = join(sandbox.cwd, "spawn-recorder");

            await writeTelemetrySpawnRecorder(execPath);
            sandbox.env.OO_TEST_TELEMETRY_SPAWN_MARKER = markerPath;

            const command = await sandbox.run(["config", "list"], { execPath });
            const database = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                expect(command.exitCode).toBe(0);
                expect(readTelemetryStateNumber(
                    database,
                    "next_spawn_after_ms",
                )).toBeUndefined();
            }
            finally {
                database.close();
            }

            await Bun.sleep(50);
            expect(await Bun.file(markerPath).exists()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    posixTest("spawns the flusher when the outbox crosses the threshold after a deferred command", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const markerPath = join(sandbox.cwd, "spawn-marker");
            const execPath = join(sandbox.cwd, "spawn-recorder");

            await writeTelemetrySpawnRecorder(execPath);
            sandbox.env.OO_TEST_TELEMETRY_SPAWN_MARKER = markerPath;

            const deferredCommand = await sandbox.run(["config", "list"], { execPath });

            await Bun.sleep(50);
            expect(deferredCommand.exitCode).toBe(0);
            expect(await Bun.file(markerPath).exists()).toBeFalse();

            for (let index = 0; index < telemetrySpawnThresholdEvents - 1; index += 1) {
                enqueueTelemetryBatchItem({
                    directoryPath: telemetryDirectoryPath,
                    item: createTelemetryItemForTest(index),
                    nowMs: index + 1,
                });
            }

            const thresholdCommand = await sandbox.run(["config", "path"], { execPath });
            const nextDatabase = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                expect(thresholdCommand.exitCode).toBe(0);
                expect(readTelemetryStateNumber(
                    nextDatabase,
                    "next_spawn_after_ms",
                )).toBeDefined();
                expect(await waitForFile(markerPath)).toBeTrue();
            }
            finally {
                nextDatabase.close();
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    posixTest("spawns the flusher when the outbox reaches threshold", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const markerPath = join(sandbox.cwd, "spawn-marker");
            const execPath = join(sandbox.cwd, "spawn-recorder");

            await writeTelemetrySpawnRecorder(execPath);
            sandbox.env.OO_TEST_TELEMETRY_SPAWN_MARKER = markerPath;

            for (let index = 0; index < telemetrySpawnThresholdEvents - 1; index += 1) {
                enqueueTelemetryBatchItem({
                    directoryPath: telemetryDirectoryPath,
                    item: createTelemetryItemForTest(index),
                    nowMs: index + 1,
                });
            }

            const startedAtMs = Date.now();
            const command = await sandbox.run(["config", "list"], { execPath });
            const nextDatabase = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                const nextSpawnAfterMs = readTelemetryStateNumber(
                    nextDatabase,
                    "next_spawn_after_ms",
                );

                expect(command.exitCode).toBe(0);
                expect(nextSpawnAfterMs).toBeGreaterThanOrEqual(
                    startedAtMs + telemetrySpawnIntervalMs,
                );
                expect(nextSpawnAfterMs).toBeLessThanOrEqual(
                    Date.now() + telemetrySpawnIntervalMs,
                );
                expect(await waitForFile(markerPath)).toBeTrue();
            }
            finally {
                nextDatabase.close();
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    posixTest("does not repeatedly spawn the flusher across one hundred instant version commands", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const markerPath = join(sandbox.cwd, "spawn-marker");
            const execPath = join(sandbox.cwd, "spawn-recorder");

            await writeTelemetrySpawnCountingRecorder(execPath);
            sandbox.env.OO_TEST_TELEMETRY_SPAWN_MARKER = markerPath;

            for (let index = 0; index < 100; index += 1) {
                const command = await sandbox.run(["--version"], { execPath });

                expect(command.exitCode).toBe(0);
            }

            await Bun.sleep(50);

            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toHaveLength(100);
            expect(await readSpawnRecordCount(markerPath)).toBeLessThanOrEqual(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("respects flusher spawn backoff even when the outbox is over threshold", async () => {
        const sandbox = await createCliSandbox();

        try {
            const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
            const futureSpawnAfterMs = Date.now() + 24 * 60 * 60 * 1000;

            for (let index = 0; index < telemetrySpawnThresholdEvents; index += 1) {
                enqueueTelemetryBatchItem({
                    directoryPath: telemetryDirectoryPath,
                    item: createTelemetryItemForTest(index),
                    nowMs: index + 1,
                });
            }

            const database = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                writeTelemetryStateNumber(
                    database,
                    "next_spawn_after_ms",
                    futureSpawnAfterMs,
                );
            }
            finally {
                database.close();
            }

            const command = await sandbox.run(["config", "list"]);
            const nextDatabase = openTelemetryDatabase(telemetryDirectoryPath);

            try {
                expect(command.exitCode).toBe(0);
                expect(readTelemetryStateNumber(
                    nextDatabase,
                    "next_spawn_after_ms",
                )).toBe(futureSpawnAfterMs);
            }
            finally {
                nextDatabase.close();
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function resolveSandboxTelemetryDirectory(sandbox: {
    env: Record<string, string | undefined>;
}): string {
    return join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry");
}

async function writeTelemetrySpawnRecorder(filePath: string): Promise<void> {
    await Bun.write(
        filePath,
        [
            "#!/bin/sh",
            "printf spawned > \"$OO_TEST_TELEMETRY_SPAWN_MARKER\"",
            "",
        ].join("\n"),
    );
    await chmod(filePath, 0o755);
}

async function writeTelemetrySpawnCountingRecorder(filePath: string): Promise<void> {
    await Bun.write(
        filePath,
        [
            "#!/bin/sh",
            "printf 'spawned\\n' >> \"$OO_TEST_TELEMETRY_SPAWN_MARKER\"",
            "",
        ].join("\n"),
    );
    await chmod(filePath, 0o755);
}

async function readSpawnRecordCount(filePath: string): Promise<number> {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
        return 0;
    }

    return (await file.text())
        .split("\n")
        .filter(line => line !== "")
        .length;
}

async function waitForFile(filePath: string): Promise<boolean> {
    const deadlineMs = Date.now() + 2_000;

    while (Date.now() < deadlineMs) {
        if (await Bun.file(filePath).exists()) {
            return true;
        }

        await Bun.sleep(10);
    }

    return await Bun.file(filePath).exists();
}
