import { readEnvBoolean } from "../shared/env-boolean.ts";

export const selfUpdateDisabledEnvName = "OO_NO_SELF_UPDATE";

// True when OO_NO_SELF_UPDATE is set to a truthy value. Embedded callers set
// this so the bundled binary never updates itself or rewrites PATH; the update
// and install commands refuse to run and PATH modification is forced off.
export function isSelfUpdateDisabledByEnv(
    env: Record<string, string | undefined>,
): boolean {
    return readEnvBoolean(env[selfUpdateDisabledEnvName]) === true;
}
