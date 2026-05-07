import { describe, expect, test } from "bun:test";
import {
    bucketTelemetryBytes,
    bucketTelemetryCount,
    bucketTelemetryStringLength,
} from "./buckets.ts";

describe("telemetry buckets", () => {
    test("buckets counts into bounded cardinality ranges", () => {
        expect([
            bucketTelemetryCount(0),
            bucketTelemetryCount(1),
            bucketTelemetryCount(5),
            bucketTelemetryCount(6),
            bucketTelemetryCount(20),
            bucketTelemetryCount(21),
            bucketTelemetryCount(100),
            bucketTelemetryCount(101),
        ]).toEqual([
            "0",
            "1-5",
            "1-5",
            "6-20",
            "6-20",
            "21-100",
            "21-100",
            "100+",
        ]);
    });

    test("buckets string length by Unicode code points", () => {
        expect(bucketTelemetryStringLength("")).toBe("0");
        expect(bucketTelemetryStringLength("hello")).toBe("1-5");
        expect(bucketTelemetryStringLength("你好世界好")).toBe("1-5");
        expect(bucketTelemetryStringLength("你好世界你好")).toBe("6-20");
    });

    test("buckets bytes into bounded size ranges", () => {
        expect([
            bucketTelemetryBytes(0),
            bucketTelemetryBytes(1),
            bucketTelemetryBytes(1023),
            bucketTelemetryBytes(1024),
            bucketTelemetryBytes(1024 * 1024),
            bucketTelemetryBytes(10 * 1024 * 1024),
            bucketTelemetryBytes(100 * 1024 * 1024),
        ]).toEqual([
            "0",
            "<1KB",
            "<1KB",
            "<1MB",
            "<10MB",
            "<100MB",
            "100MB+",
        ]);
    });
});
