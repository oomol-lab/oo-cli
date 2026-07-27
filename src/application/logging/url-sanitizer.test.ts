import { describe, expect, test } from "bun:test";

import {
    sanitizeIfHttpUrl,
    sanitizeUrlForLogging,
    serializeErrorForLogging,
} from "./url-sanitizer.ts";

describe("sanitizeUrlForLogging", () => {
    test("redacts query values while keeping parameter names", () => {
        const sanitized = sanitizeUrlForLogging(
            "https://download.example.com/files/report.txt?signature=abc123&expires=1700000000",
        );

        expect(sanitized).toBe(
            "https://download.example.com/files/report.txt?signature=REDACTED&expires=REDACTED",
        );
    });

    test("accepts URL instances", () => {
        const sanitized = sanitizeUrlForLogging(
            new URL("https://example.com/path?token=secret"),
        );

        expect(sanitized).toBe("https://example.com/path?token=REDACTED");
    });

    test("keeps URLs without a query untouched", () => {
        expect(sanitizeUrlForLogging("https://example.com/files/report.txt")).toBe(
            "https://example.com/files/report.txt",
        );
    });

    test("drops userinfo credentials and fragments", () => {
        const sanitized = sanitizeUrlForLogging(
            "https://user:pass@example.com/path?sig=abc#access_token=xyz",
        );

        expect(sanitized).toBe("https://example.com/path?sig=REDACTED");
    });

    test("collapses duplicate parameters into one redacted entry", () => {
        const sanitized = sanitizeUrlForLogging(
            "https://example.com/path?tag=one&tag=two&sig=abc",
        );

        expect(sanitized).toBe("https://example.com/path?tag=REDACTED&sig=REDACTED");
    });

    test("replaces unparseable input with a placeholder", () => {
        expect(sanitizeUrlForLogging("not a url ?signature=abc")).toBe(
            "<unparseable-url>",
        );
    });
});

describe("sanitizeIfHttpUrl", () => {
    test("sanitizes http and https values, including uppercase schemes", () => {
        expect(sanitizeIfHttpUrl("HTTPS://Example.com/Path?Sig=abc")).toBe(
            "https://example.com/Path?Sig=REDACTED",
        );
        expect(sanitizeIfHttpUrl("http://example.com/p?token=abc")).toBe(
            "http://example.com/p?token=REDACTED",
        );
    });

    test("leaves non-URL strings unchanged", () => {
        expect(sanitizeIfHttpUrl("plain-value")).toBe("plain-value");
        expect(sanitizeIfHttpUrl("/local/file/path")).toBe("/local/file/path");
    });
});

describe("serializeErrorForLogging", () => {
    test("sanitizes URL-shaped path properties from fetch errors", () => {
        const error = Object.assign(new Error("Unable to connect."), {
            code: "ConnectionRefused",
            path: "https://download.example.com/file?signature=secret123",
        });

        const serialized = serializeErrorForLogging(error);

        expect(serialized.path).toBe(
            "https://download.example.com/file?signature=REDACTED",
        );
        expect(serialized.message).toBe("Unable to connect.");
        expect(serialized.code).toBe("ConnectionRefused");
    });

    test("keeps local filesystem path properties untouched", () => {
        const error = Object.assign(new Error("ENOENT: no such file"), {
            code: "ENOENT",
            path: "/tmp/some/local/file.txt",
        });

        const serialized = serializeErrorForLogging(error);

        expect(serialized.path).toBe("/tmp/some/local/file.txt");
    });

    test("serializes errors without a path property unchanged", () => {
        const serialized = serializeErrorForLogging(new Error("Plain failure."));

        expect(serialized.message).toBe("Plain failure.");
        expect(serialized.path).toBeUndefined();
    });

    test("sanitizes URL strings inside error params without mutating the error", () => {
        const params = {
            message: "https://h.example.com/p?token=param-secret",
            status: 403,
        };
        const error = Object.assign(new Error("Request failed."), { params });

        const serialized = serializeErrorForLogging(error);

        // pino's err serializer decorates message-bearing nested objects with
        // type/stack fields; only the sanitized values matter here.
        expect(serialized.params).toMatchObject({
            message: "https://h.example.com/p?token=REDACTED",
            status: 403,
        });
        expect(JSON.stringify(serialized)).not.toContain("param-secret");
        expect(params.message).toBe("https://h.example.com/p?token=param-secret");
    });
});
