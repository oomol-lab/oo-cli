import { describe, expect, test } from "bun:test";
import {
    resolveSelfUpdateShowPathShadowingWarning,
    selfUpdateHidePathShadowingWarningEnvName,
} from "./path-shadowing-warning-preference.ts";

describe("resolveSelfUpdateShowPathShadowingWarning", () => {
    test("shows the warning by default", () => {
        expect(resolveSelfUpdateShowPathShadowingWarning({
            env: {},
        })).toBeTrue();
    });

    test("hides the warning when the env var is truthy", () => {
        for (const value of ["1", "true", "YES"]) {
            expect(resolveSelfUpdateShowPathShadowingWarning({
                env: { [selfUpdateHidePathShadowingWarningEnvName]: value },
            })).toBeFalse();
        }
    });

    test("shows the warning when the env var is falsy or unrecognized", () => {
        for (const value of ["0", "false", "no", "", "maybe"]) {
            expect(resolveSelfUpdateShowPathShadowingWarning({
                env: { [selfUpdateHidePathShadowingWarningEnvName]: value },
            })).toBeTrue();
        }
    });
});
