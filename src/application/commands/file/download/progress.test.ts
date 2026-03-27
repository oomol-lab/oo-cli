import { describe, expect, test } from "bun:test";

import { formatByteCount } from "./progress.ts";

describe("formatByteCount", () => {
    test("keeps byte-sized values in bytes", () => {
        expect(formatByteCount(0)).toBe("0 B");
        expect(formatByteCount(11)).toBe("11 B");
        expect(formatByteCount(1023)).toBe("1023 B");
    });

    test("uses larger units for kilobytes megabytes and gigabytes", () => {
        expect(formatByteCount(1024)).toBe("1 KB");
        expect(formatByteCount(1536)).toBe("1.5 KB");
        expect(formatByteCount(1024 * 1024)).toBe("1 MB");
        expect(formatByteCount(5.5 * 1024 * 1024)).toBe("5.5 MB");
        expect(formatByteCount(3 * 1024 * 1024 * 1024)).toBe("3 GB");
    });
});
