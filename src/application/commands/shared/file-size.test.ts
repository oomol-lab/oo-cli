import { describe, expect, test } from "bun:test";

import { formatFileSize } from "./file-size.ts";

describe("formatFileSize", () => {
    test("renders bytes without decimals and larger units with two", () => {
        expect(formatFileSize(0)).toBe("0 B");
        expect(formatFileSize(1023)).toBe("1023 B");
        expect(formatFileSize(1024)).toBe("1.00 KiB");
        expect(formatFileSize(1_536)).toBe("1.50 KiB");
        expect(formatFileSize(20 * 1024 * 1024)).toBe("20.00 MiB");
        expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3.00 GiB");
    });

    test("stops at the largest known unit", () => {
        expect(formatFileSize(2048 * 1024 * 1024 * 1024)).toBe("2048.00 GiB");
    });
});
