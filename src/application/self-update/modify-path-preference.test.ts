import { describe, expect, test } from "bun:test";
import {
    resolveSelfUpdateModifyPath,
    selfUpdateNoModifyPathEnvName,
} from "./modify-path-preference.ts";

describe("resolveSelfUpdateModifyPath", () => {
    test("modifies PATH by default when neither flag nor env disables it", () => {
        expect(resolveSelfUpdateModifyPath({
            env: {},
            modifyPathFlag: true,
        })).toBeTrue();
    });

    test("skips PATH modification when --no-modify-path is passed", () => {
        expect(resolveSelfUpdateModifyPath({
            env: {},
            modifyPathFlag: false,
        })).toBeFalse();
    });

    test("skips PATH modification when OO_NO_MODIFY_PATH is truthy", () => {
        for (const value of ["1", "true", "YES"]) {
            expect(resolveSelfUpdateModifyPath({
                env: { [selfUpdateNoModifyPathEnvName]: value },
                modifyPathFlag: true,
            })).toBeFalse();
        }
    });

    test("keeps modifying PATH when OO_NO_MODIFY_PATH is falsy or unrecognized", () => {
        for (const value of ["0", "false", "no", "", "maybe"]) {
            expect(resolveSelfUpdateModifyPath({
                env: { [selfUpdateNoModifyPathEnvName]: value },
                modifyPathFlag: true,
            })).toBeTrue();
        }
    });

    test("flag and env combine with OR semantics for skipping", () => {
        expect(resolveSelfUpdateModifyPath({
            env: { [selfUpdateNoModifyPathEnvName]: "1" },
            modifyPathFlag: false,
        })).toBeFalse();
    });
});
