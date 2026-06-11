import { describe, expect, test } from "bun:test";
import {
    isSelfUpdateDisabledByEnv,
    selfUpdateDisabledEnvName,
} from "./self-update-disabled-preference.ts";

describe("isSelfUpdateDisabledByEnv", () => {
    test("returns true for truthy OO_NO_SELF_UPDATE values", () => {
        for (const value of ["1", "true", "YES", " on "]) {
            expect(isSelfUpdateDisabledByEnv({
                [selfUpdateDisabledEnvName]: value,
            })).toBeTrue();
        }
    });

    test("returns false when OO_NO_SELF_UPDATE is unset, falsy, or unrecognized", () => {
        expect(isSelfUpdateDisabledByEnv({})).toBeFalse();

        for (const value of ["0", "false", "no", "", "maybe"]) {
            expect(isSelfUpdateDisabledByEnv({
                [selfUpdateDisabledEnvName]: value,
            })).toBeFalse();
        }
    });
});
