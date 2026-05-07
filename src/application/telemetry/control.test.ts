import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import {
    readTelemetrySettingsFile,
    resolveTelemetryStatusFromSettingsFile,
} from "./control.ts";

describe("telemetry control", () => {
    test("preserves telemetry opt-out when unrelated settings are invalid", async () => {
        const root = await createTemporaryDirectory("telemetry-control");
        const settingsFilePath = join(root, "settings.toml");

        await Bun.write(
            settingsFilePath,
            [
                "lang = 1",
                "",
                "[telemetry]",
                "enabled = false",
                "",
            ].join("\n"),
        );

        await expect(readTelemetrySettingsFile(settingsFilePath)).resolves.toEqual({
            telemetry: {
                enabled: false,
            },
        });
        await expect(resolveTelemetryStatusFromSettingsFile({
            env: {},
            settingsFilePath,
        })).resolves.toEqual({
            disabledReason: "config",
            enabled: false,
        });
    });
});
