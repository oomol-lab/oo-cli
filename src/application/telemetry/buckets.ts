export type TelemetryCountBucket = "0" | "1-5" | "6-20" | "21-100" | "100+";
export type TelemetryByteBucket
    = | "0"
        | "100MB+"
        | "<100MB"
        | "<10MB"
        | "<1KB"
        | "<1MB";
export type TelemetryStringLengthBucket = TelemetryCountBucket;

export function bucketTelemetryCount(count: number): TelemetryCountBucket {
    if (count <= 0) {
        return "0";
    }

    if (count <= 5) {
        return "1-5";
    }

    if (count <= 20) {
        return "6-20";
    }

    if (count <= 100) {
        return "21-100";
    }

    return "100+";
}

export function bucketTelemetryStringLength(
    value: string,
): TelemetryStringLengthBucket {
    return bucketTelemetryCount(Array.from(value).length);
}

export function bucketTelemetryBytes(bytes: number): TelemetryByteBucket {
    if (bytes <= 0) {
        return "0";
    }

    if (bytes < 1024) {
        return "<1KB";
    }

    if (bytes < 1024 * 1024) {
        return "<1MB";
    }

    if (bytes < 10 * 1024 * 1024) {
        return "<10MB";
    }

    if (bytes < 100 * 1024 * 1024) {
        return "<100MB";
    }

    return "100MB+";
}
