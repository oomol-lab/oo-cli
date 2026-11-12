import { describe, expect, test } from "bun:test";
import { formatDuration, parseDuration } from "./duration.ts";

describe("spaces durations", () => {
    test("parses a unit suffix and treats a bare number as seconds", () => {
        expect(parseDuration("5m")).toBe(300_000);
        expect(parseDuration("90s")).toBe(90_000);
        expect(parseDuration("2h")).toBe(7_200_000);
        expect(parseDuration("1500ms")).toBe(1_500);
        expect(parseDuration(" 1.5 M ")).toBe(90_000);
        expect(parseDuration("300")).toBe(300_000);
    });

    test("rejects text that is not a positive duration", () => {
        for (const value of ["", "m", "0", "0s", "-5s", "1e3", "5 minutes", "1.2.3s", ".5s"]) {
            expect(parseDuration(value)).toBeUndefined();
        }
    });

    test("formats a duration with its largest fitting units", () => {
        expect(formatDuration(500)).toBe("500ms");
        expect(formatDuration(45_000)).toBe("45s");
        expect(formatDuration(300_000)).toBe("5m");
        expect(formatDuration(90_000)).toBe("1m30s");
    });
});
