import { readEnvBoolean } from "../shared/env-boolean.ts";

export const selfUpdateNoModifyPathEnvName = "OO_NO_MODIFY_PATH";

export function resolveSelfUpdateModifyPath(options: {
    env: Record<string, string | undefined>;
    modifyPathFlag: boolean;
}): boolean {
    if (!options.modifyPathFlag) {
        return false;
    }

    return readEnvBoolean(options.env[selfUpdateNoModifyPathEnvName]) !== true;
}
