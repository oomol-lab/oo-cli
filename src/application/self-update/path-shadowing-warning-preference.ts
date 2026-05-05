import { readEnvBoolean } from "../shared/env-boolean.ts";

export const selfUpdateHidePathShadowingWarningEnvName
    = "OO_HIDE_PATH_SHADOWING_WARNING";

export function resolveSelfUpdateShowPathShadowingWarning(options: {
    env: Record<string, string | undefined>;
}): boolean {
    return readEnvBoolean(
        options.env[selfUpdateHidePathShadowingWarningEnvName],
    ) !== true;
}
