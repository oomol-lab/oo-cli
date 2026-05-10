import { describe, expect, test } from "bun:test";

import { isProcessLockOwnerActive } from "./process-owner.ts";

describe("process lock owner", () => {
    test("treats a missing pid as inactive", () => {
        expect(
            isProcessLockOwnerActive(
                999_999_999,
                process.execPath,
                process.platform,
            ),
        ).toBeFalse();
    });

    test("treats a live Windows pid as active when command line verification is unavailable", () => {
        expect(
            isProcessLockOwnerActive(
                process.pid,
                "/tmp/not-the-current-executable",
                "win32",
            ),
        ).toBeTrue();
    });

    if (process.platform !== "win32") {
        test("treats a live pid as active when the command line references the executable", () => {
            expect(
                isProcessLockOwnerActive(
                    process.pid,
                    process.execPath,
                    process.platform,
                ),
            ).toBeTrue();
        });

        test("does not treat a live pid as active when the command line references another executable", () => {
            expect(
                isProcessLockOwnerActive(
                    process.pid,
                    "/tmp/not-the-current-executable",
                    process.platform,
                ),
            ).toBeFalse();
        });

        test("does not treat a live pid as active when the executable path is only a prefix", () => {
            expect(
                isProcessLockOwnerActive(
                    process.pid,
                    process.execPath.slice(0, -1),
                    process.platform,
                ),
            ).toBeFalse();
        });
    }
});
