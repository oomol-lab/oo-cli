import type { CliCommandDefinition } from "../contracts/cli.ts";

import { z } from "zod";
import { requireIdentity } from "../auth/identity.ts";
import { CliUserError } from "../contracts/cli.ts";
import { createWriterColors } from "../terminal-colors.ts";
import { loginUrlColor } from "./auth/login.ts";
import { buildOoRequestUrl, requestOo } from "./shared/oo-request.ts";
import { writeLine } from "./shared/output.ts";

interface OpenInput {
    redirect?: string;
}

const sessionCodeResponseSchema = z.object({
    expires_in: z.number(),
    session_code: z.string().min(1),
});

export const openCommand: CliCommandDefinition<OpenInput> = {
    name: "open",
    summaryKey: "commands.open.summary",
    descriptionKey: "commands.open.description",
    output: "standard",
    options: [
        {
            name: "redirect",
            longFlag: "--redirect",
            valueName: "url",
            descriptionKey: "options.open.redirect",
        },
    ],
    inputSchema: z.object({
        redirect: z.string().optional(),
    }),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const redirectTarget = resolveRedirectTarget(
            input.redirect,
            account.endpoint,
        );
        const session = await requestOo({
            authorization: `Bearer ${account.apiKey}`,
            context,
            errors: { scope: "open" },
            host: { endpoint: account.endpoint, service: "api" },
            label: "Open sign-in",
            method: "POST",
            path: "/v1/auth/session_code",
            schema: sessionCodeResponseSchema,
        });
        // The session code signs its opener in to the account, so the URL may
        // reach stdout only, never a log field.
        const signInUrl = buildOoRequestUrl({
            host: { endpoint: account.endpoint, service: "api" },
            path: "/v1/auth/session_code/exchange",
            query: {
                redirect: redirectTarget,
                session_code: session.session_code,
            },
        }).toString();

        context.telemetry?.recordProperties({
            has_custom_redirect: input.redirect !== undefined,
        });

        context.output.emit(
            { expiresIn: session.expires_in, url: signInUrl },
            () => {
                const colors = createWriterColors(context.stdout);

                writeLine(context.stdout, context.translator.t("open.hint"));
                writeLine(context.stdout, colors.hex(loginUrlColor)(signInUrl));
                writeLine(
                    context.stdout,
                    context.translator.t("open.expires", {
                        seconds: session.expires_in,
                    }),
                );
                writeLine(context.stdout, context.translator.t("open.doNotShare"));
            },
        );
    },
};

// Resolves where the browser lands after the sign-in completes. Without
// --redirect the account endpoint's console is used as-is; an explicit target
// must parse as an http(s) URL on the endpoint's own domain, so mistakes fail
// here with a clear message instead of on an opaque browser error page.
export function resolveRedirectTarget(
    redirect: string | undefined,
    endpoint: string,
): string {
    if (redirect === undefined) {
        return `https://console.${endpoint}/`;
    }

    // The parsed hostname is WHATWG-normalized (lowercase, no port), so the
    // endpoint must be reduced to the same form before comparing, or saved
    // endpoints with uppercase letters or a port could never match.
    const endpointHostname = URL.parse(`https://${endpoint}`)?.hostname
        ?? endpoint.toLowerCase();
    const parsed = URL.parse(redirect);

    if (parsed === null || !isAllowedRedirectTarget(parsed, endpointHostname)) {
        throw new CliUserError("errors.open.redirectInvalid", 2, {
            endpoint: endpointHostname,
            value: redirect,
        });
    }

    return parsed.toString();
}

// The sign-in exchange stays within one deployment, so the redirect must be
// the account endpoint's host or a subdomain of it. Targets on another
// environment (for example an oomol.com redirect while the endpoint is
// oomol.dev) are rejected.
function isAllowedRedirectTarget(target: URL, endpointHostname: string): boolean {
    if (target.protocol !== "https:" && target.protocol !== "http:") {
        return false;
    }

    const { hostname } = target;

    return hostname === endpointHostname
        || hostname.endsWith(`.${endpointHostname}`);
}
