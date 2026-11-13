import type { SettingsStore } from "../contracts/settings-store.ts";
import type { AppSettings } from "../schemas/settings.ts";

import { describe, expect, test } from "bun:test";

import { createLogCapture } from "../../../__tests__/helpers.ts";
import { resolveManagedSkillInstallEnabled } from "./bundled-skills.ts";

describe("resolveManagedSkillInstallEnabled", () => {
    test("installs bundled skills when skills.bundled.auto_sync is unset", async () => {
        const logCapture = createLogCapture();

        try {
            expect(await resolveManagedSkillInstallEnabled({
                logger: logCapture.logger,
                settingsStore: createSettingsStore(async () => ({})),
            })).toBeTrue();
        }
        finally {
            logCapture.close();
        }
    });

    test("skips bundled skills when skills.bundled.auto_sync is false", async () => {
        const logCapture = createLogCapture();

        try {
            expect(await resolveManagedSkillInstallEnabled({
                logger: logCapture.logger,
                settingsStore: createSettingsStore(async () => ({
                    skills: { bundled: { auto_sync: false } },
                })),
            })).toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });

    test("falls back to installing when the settings file cannot be read", async () => {
        const logCapture = createLogCapture();

        try {
            expect(await resolveManagedSkillInstallEnabled({
                logger: logCapture.logger,
                settingsStore: createSettingsStore(async () => {
                    throw new Error("settings unreadable");
                }),
            })).toBeTrue();
            expect(logCapture.read()).toContain(
                "Reading skills.bundled.auto_sync failed; installing bundled skills as by default.",
            );
        }
        finally {
            logCapture.close();
        }
    });
});

function createSettingsStore(read: () => Promise<AppSettings>): SettingsStore {
    return {
        getFilePath: () => "/unused/settings.toml",
        read,
        update: async () => {
            throw new Error("update should not be called");
        },
        write: async () => {
            throw new Error("write should not be called");
        },
    };
}
