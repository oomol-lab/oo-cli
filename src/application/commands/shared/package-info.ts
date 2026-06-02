import type { RequestLanguage } from "../../../i18n/locale.ts";
import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { isAsciiDigit, isSemver as isValidSemver } from "../../semver.ts";
import { requestText } from "./request.ts";

const LATEST_PACKAGE_VERSION = "latest";

const packageInfoResponseSchema = z.object({
    access: z.enum(["private", "public", "restricted"]).optional(),
    blocks: z.array(z.unknown()).optional().default([]),
    isPrivate: z.boolean().optional(),
    packageName: z.string().min(1),
    packageVersion: z.string().min(1),
    visibility: z.enum(["private", "public", "restricted"]).optional(),
}).passthrough();

export interface ParsePackageSpecifierOptions {
    errorKey?: string;
    requireSemver?: boolean;
    requireVersion?: boolean;
}

export interface ParsedPackageSpecifier {
    packageName: string;
    packageVersion: string;
}

export interface PackageInfoResponse {
    access?: "private" | "public" | "restricted";
    blocks: unknown[];
    packageName: string;
    packageVersion: string;
}

export function parsePackageSpecifier(
    packageSpecifier: string,
    options: ParsePackageSpecifierOptions = {},
): ParsedPackageSpecifier {
    const trimmedPackageSpecifier = packageSpecifier.trim();
    const errorKey = options.errorKey ?? "errors.packageInfo.invalidPackageSpecifier";

    if (trimmedPackageSpecifier === "") {
        throw new CliUserError(errorKey, 2, {
            value: packageSpecifier,
        });
    }

    const versionSeparatorIndex = resolveVersionSeparatorIndex(
        trimmedPackageSpecifier,
        options.requireSemver === true ? isValidSemver : looksLikePackageVersion,
    );

    if (versionSeparatorIndex < 0) {
        if (options.requireVersion === true) {
            throw new CliUserError(errorKey, 2, {
                value: packageSpecifier,
            });
        }

        return {
            packageName: trimmedPackageSpecifier,
            packageVersion: LATEST_PACKAGE_VERSION,
        };
    }

    const packageName = trimmedPackageSpecifier.slice(0, versionSeparatorIndex);
    const packageVersion = trimmedPackageSpecifier.slice(versionSeparatorIndex + 1);

    if (
        packageName === ""
        || packageVersion === ""
        || (options.requireSemver === true && !isValidSemver(packageVersion))
    ) {
        throw new CliUserError(errorKey, 2, {
            value: packageSpecifier,
        });
    }

    return {
        packageName,
        packageVersion,
    };
}

export async function loadPackageInfo(
    packageSpecifier: ParsedPackageSpecifier,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    requestLanguage: RequestLanguage,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<PackageInfoResponse> {
    const rawResponse = await requestPackageInfo(
        createPackageInfoRequestUrl(
            account.endpoint,
            packageSpecifier,
            requestLanguage,
        ),
        account.apiKey,
        context,
    );

    return parseRawPackageInfoResponse(rawResponse);
}

function resolveVersionSeparatorIndex(
    packageSpecifier: string,
    isValidVersion: (value: string) => boolean,
): number {
    const lastAtIndex = packageSpecifier.lastIndexOf("@");

    if (lastAtIndex <= 0) {
        return -1;
    }

    const version = packageSpecifier.slice(lastAtIndex + 1);

    if (!isValidVersion(version)) {
        return -1;
    }

    return lastAtIndex;
}

function looksLikePackageVersion(version: string): boolean {
    if (version === LATEST_PACKAGE_VERSION) {
        return true;
    }

    if (version.includes(".")) {
        return true;
    }

    return Array.from(version).some(character => isAsciiDigit(character));
}

function createPackageInfoRequestUrl(
    endpoint: string,
    packageSpecifier: Pick<ParsedPackageSpecifier, "packageName" | "packageVersion">,
    requestLanguage: RequestLanguage,
): URL {
    const requestUrl = new URL(
        `https://registry.${endpoint}/-/oomol/package-info/${encodeURIComponent(packageSpecifier.packageName)}/${encodeURIComponent(packageSpecifier.packageVersion)}`,
    );

    requestUrl.searchParams.set("lang", requestLanguage);

    return requestUrl;
}

async function requestPackageInfo(
    requestUrl: URL,
    apiKey: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<string> {
    const pathSegments = requestUrl.pathname.split("/");
    const packageName = decodeURIComponent(pathSegments.at(-2) ?? "");
    const packageVersion = decodeURIComponent(pathSegments.at(-1) ?? "");

    return await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.packageInfo.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.packageInfo.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            common: withPackageIdentity(packageName, packageVersion),
            start: {
                requestLanguage: requestUrl.searchParams.get("lang") ?? "",
            },
        },
        init: {
            headers: {
                Authorization: apiKey,
            },
        },
        requestLabel: "Package info",
        requestUrl,
    });
}

function parseRawPackageInfoResponse(rawResponse: string): PackageInfoResponse {
    try {
        const parsedResponse = packageInfoResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );

        return {
            access: resolvePackageInfoAccess(parsedResponse),
            blocks: parsedResponse.blocks,
            packageName: parsedResponse.packageName,
            packageVersion: parsedResponse.packageVersion,
        };
    }
    catch {
        throw new CliUserError("errors.packageInfo.invalidResponse", 1);
    }
}

function resolvePackageInfoAccess(
    parsedResponse: z.output<typeof packageInfoResponseSchema>,
): PackageInfoResponse["access"] {
    if (parsedResponse.isPrivate !== undefined) {
        return parsedResponse.isPrivate ? "private" : "public";
    }

    return parsedResponse.visibility ?? parsedResponse.access;
}
