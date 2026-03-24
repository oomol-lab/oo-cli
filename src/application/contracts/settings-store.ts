import type { AppSettings } from "../schemas/settings.ts";

export interface SettingsStore {
    getFilePath: () => string;
    read: () => Promise<AppSettings>;
    write: (settings: AppSettings) => Promise<AppSettings>;
    update: (
        updater: (settings: AppSettings) => AppSettings,
    ) => Promise<AppSettings>;
}
