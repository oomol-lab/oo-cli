import { describe, expect, test } from "bun:test";

import { expectCliUserError } from "../../../__tests__/helpers.ts";
import { resolveRedirectTarget } from "./open.ts";

describe("resolveRedirectTarget", () => {
    test("defaults to the console of the account endpoint", () => {
        expect(resolveRedirectTarget(undefined, "oomol.com"))
            .toBe("https://console.oomol.com/");
    });

    test("accepts http(s) URLs on the endpoint's domain and its subdomains", () => {
        expect(resolveRedirectTarget("https://flow.oomol.com/apps?tab=1", "oomol.com"))
            .toBe("https://flow.oomol.com/apps?tab=1");
        expect(resolveRedirectTarget("https://oomol.com/pricing", "oomol.com"))
            .toBe("https://oomol.com/pricing");
        expect(resolveRedirectTarget("http://console.oomol.d/flows", "oomol.d"))
            .toBe("http://console.oomol.d/flows");
    });

    test("keeps a multi-parameter query on the redirect target", () => {
        expect(resolveRedirectTarget("https://flow.oomol.com/apps?a=1&b=2", "oomol.com"))
            .toBe("https://flow.oomol.com/apps?a=1&b=2");
    });

    test("accepts the account endpoint and its subdomains", () => {
        expect(resolveRedirectTarget("https://internal.example.com/", "internal.example.com"))
            .toBe("https://internal.example.com/");
        expect(resolveRedirectTarget("https://console.internal.example.com/home", "internal.example.com"))
            .toBe("https://console.internal.example.com/home");
    });

    test("compares the endpoint as a normalized hostname", () => {
        // A parsed hostname is lowercase and port-free, so a saved endpoint
        // with uppercase letters or a port must still match.
        expect(resolveRedirectTarget("https://console.internal.example.com/", "Internal.Example.COM"))
            .toBe("https://console.internal.example.com/");
        expect(resolveRedirectTarget("http://localhost:8443/home", "localhost:8443"))
            .toBe("http://localhost:8443/home");
    });

    test("rejects hosts off the endpoint's domain", () => {
        const error = expectCliUserError(
            () => resolveRedirectTarget("https://example.com/", "oomol.com"),
        );

        expect(error.key).toBe("errors.open.redirectInvalid");
        expect(error.exitCode).toBe(2);
        // The suffix match requires the separating dot, so a lookalike domain
        // that merely ends with the endpoint name stays rejected.
        expectCliUserError(
            () => resolveRedirectTarget("https://eviloomol.com/", "oomol.com"),
        );
    });

    test("rejects targets on a different OOMOL environment", () => {
        expectCliUserError(
            () => resolveRedirectTarget("https://console.oomol.com/", "oomol.dev"),
        );
        expectCliUserError(
            () => resolveRedirectTarget("https://console.oomol.dev/", "oomol.com"),
        );
        expectCliUserError(
            () => resolveRedirectTarget("https://console.oomol.d/", "oomol.com"),
        );
    });

    test("rejects non-http protocols and unparseable values", () => {
        expectCliUserError(
            () => resolveRedirectTarget("javascript:alert(1)", "oomol.com"),
        );
        expectCliUserError(
            () => resolveRedirectTarget("ftp://flow.oomol.com/", "oomol.com"),
        );
        expectCliUserError(
            () => resolveRedirectTarget("not a url", "oomol.com"),
        );
    });
});
