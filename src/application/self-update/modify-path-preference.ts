import { readEnvBoolean } from "../shared/env-boolean.ts";
import { isSelfUpdateDisabledByEnv } from "./self-update-disabled-preference.ts";

export const selfUpdateNoModifyPathEnvName = "OO_NO_MODIFY_PATH";

export function resolveSelfUpdateModifyPath(options: {
    env: Record<string, string | undefined>;
    modifyPathFlag: boolean;
}): boolean {
    if (!options.modifyPathFlag) {
        return false;
    }

    // OO_NO_SELF_UPDATE disables PATH modification entirely, in addition to the
    // dedicated OO_NO_MODIFY_PATH opt-out.
    if (isSelfUpdateDisabledByEnv(options.env)) {
        return false;
    }

    return readEnvBoolean(options.env[selfUpdateNoModifyPathEnvName]) !== true;
}
