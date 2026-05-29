// Preset registry skill packages that ship with the CLI: they are installed by
// default during a no-argument `oo skills install` / `oo install`, and removed
// by default during `oo uninstall`. Keeping this list in one module makes
// "what install adds by default" and "what uninstall removes by default" a
// single source of truth.
export const presetSkillPackageNames = ["@alwaysmavs/gpt-image-2"] as const;

export type PresetSkillPackageName = (typeof presetSkillPackageNames)[number];
