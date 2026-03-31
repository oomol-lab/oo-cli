import { describe, expect, test } from "bun:test";

import { createTextBuffer } from "../../../../../__tests__/helpers.ts";
import { createDownloadProgressReporter, formatByteCount } from "./progress.ts";

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

describe("createDownloadProgressReporter", () => {
    test("returns undefined for non-tty writers", () => {
        const stderr = createTextBuffer({
            isTTY: false,
        });

        expect(createDownloadProgressReporter(stderr.writer, 4)).toBeUndefined();
    });

    test("rewrites the previous line when progress output changes", () => {
        const stderr = createTextBuffer({
            isTTY: true,
        });
        const reporter = createDownloadProgressReporter(stderr.writer, 4);

        expect(reporter).toBeDefined();

        reporter!.render(1);
        reporter!.complete(4);

        expect(stderr.read()).toBe(
            "Downloading 1 B / 4 B (25%)\n"
            + "\u001B[1A\r\u001B[2KDownloaded 4 B / 4 B (100%)\n",
        );
    });
});
