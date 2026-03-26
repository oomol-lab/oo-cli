import type { RequestLanguage } from "../../../i18n/locale.ts";
import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    withAccountIdentity,
    withPackageIdentity,
    withRequestTarget,
} from "../../logging/log-fields.ts";

const PACKAGE_INFO_CACHE_ID = "package.info";
const PACKAGE_INFO_CACHE_MAX_ENTRIES = 300;
const PACKAGE_INFO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LATEST_PACKAGE_VERSION = "latest";

type PackageInfoHandleValue
    = null
        | boolean
        | number
        | string
        | PackageInfoHandleValue[]
        | { [key: string]: PackageInfoHandleValue };

const packageInfoHandleValueSchema: z.ZodType<PackageInfoHandleValue> = z.lazy(() =>
    z.union([
        z.null(),
        z.boolean(),
        z.number(),
        z.string(),
        z.array(packageInfoHandleValueSchema),
        z.record(z.string(), packageInfoHandleValueSchema),
    ]),
);

const packageInfoHandleDefSchema = z.object({
    handle: z.string().optional(),
    description: z.string().optional().default(""),
    json_schema: z.unknown().optional().default({}),
    nullable: z.boolean().optional(),
    value: packageInfoHandleValueSchema.optional(),
}).passthrough();

const packageInfoBlockSchema = z.object({
    blockName: z.string().optional().default(""),
    description: z.string().optional().default(""),
    inputHandleDefs: z.array(packageInfoHandleDefSchema).optional().default([]),
    outputHandleDefs: z.array(packageInfoHandleDefSchema).optional().default([]),
    title: z.string().optional().default(""),
}).passthrough();

const packageInfoResponseSchema = z.object({
    blocks: z.array(packageInfoBlockSchema).optional().default([]),
    description: z.string().optional().default(""),
    packageName: z.string().min(1),
    packageVersion: z.string().min(1),
    title: z.string().optional().default(""),
}).passthrough();

const transformedInputHandleSchema = z.object({
    description: z.string(),
    ext: z.record(z.string(), z.unknown()).optional(),
    nullable: z.boolean().optional(),
    schema: z.unknown(),
    value: packageInfoHandleValueSchema.optional(),
}).strict();

const transformedOutputHandleSchema = z.object({
    description: z.string(),
    ext: z.record(z.string(), z.unknown()).optional(),
    schema: z.unknown(),
}).strict();

const transformedBlockSchema = z.object({
    blockName: z.string(),
    description: z.string(),
    inputHandle: z.record(z.string(), transformedInputHandleSchema),
    outputHandle: z.record(z.string(), transformedOutputHandleSchema),
    title: z.string(),
}).strict();

const transformedPackageInfoResponseSchema = z.object({
    blocks: z.array(transformedBlockSchema),
    description: z.string(),
    displayName: z.string(),
    packageName: z.string().min(1),
    packageVersion: z.string().min(1),
}).strict();

export interface ParsePackageSpecifierOptions {
    errorKey?: string;
    requireSemver?: boolean;
    requireVersion?: boolean;
}

export interface ParsedPackageSpecifier {
    packageName: string;
    packageVersion: string;
    shouldReadCache: boolean;
}

export type PackageInfoResponse = z.output<typeof transformedPackageInfoResponseSchema>;

export function isPackageInfoInputHandleOptional(
    handle: PackageInfoResponse["blocks"][number]["inputHandle"][string],
): boolean {
    if (handle.value === null && handle.nullable === true) {
        return true;
    }

    if (handle.value !== undefined && handle.value !== null) {
        return true;
    }

    return hasPackageInfoSchemaDefault(handle.schema);
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
        options.requireSemver === true ? isSemverVersion : looksLikePackageVersion,
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
            shouldReadCache: false,
        };
    }

    const packageName = trimmedPackageSpecifier.slice(0, versionSeparatorIndex);
    const packageVersion = trimmedPackageSpecifier.slice(versionSeparatorIndex + 1);

    if (
        packageName === ""
        || packageVersion === ""
        || (options.requireSemver === true && !isSemverVersion(packageVersion))
    ) {
        throw new CliUserError(errorKey, 2, {
            value: packageSpecifier,
        });
    }

    return {
        packageName,
        packageVersion,
        shouldReadCache: packageVersion !== LATEST_PACKAGE_VERSION,
    };
}

export async function loadPackageInfo(
    packageSpecifier: ParsedPackageSpecifier,
    account: Pick<AuthAccount, "apiKey" | "endpoint" | "id">,
    requestLanguage: RequestLanguage,
    context: Pick<CliExecutionContext, "cacheStore" | "fetcher" | "logger">,
): Promise<PackageInfoResponse> {
    const packageInfoCache = context.cacheStore.getCache<string>({
        id: PACKAGE_INFO_CACHE_ID,
        defaultTtlMs: PACKAGE_INFO_CACHE_TTL_MS,
        maxEntries: PACKAGE_INFO_CACHE_MAX_ENTRIES,
    });
    const requestedCacheKey = createPackageInfoCacheKey(
        account,
        packageSpecifier.packageName,
        packageSpecifier.packageVersion,
        requestLanguage,
    );

    if (packageSpecifier.shouldReadCache) {
        const cachedResponse = packageInfoCache.get(requestedCacheKey);

        if (cachedResponse !== null) {
            context.logger.debug(
                {
                    ...withAccountIdentity(account.id, account.endpoint),
                    ...withPackageIdentity(
                        packageSpecifier.packageName,
                        packageSpecifier.packageVersion,
                    ),
                    requestLanguage,
                },
                "Package info cache hit.",
            );

            try {
                return parseCachedPackageInfoResponse(cachedResponse);
            }
            catch (error) {
                if (
                    !(error instanceof CliUserError)
                    || error.key !== "errors.packageInfo.invalidResponse"
                ) {
                    throw error;
                }

                packageInfoCache.delete(requestedCacheKey);
                context.logger.warn(
                    {
                        ...withAccountIdentity(account.id, account.endpoint),
                        ...withPackageIdentity(
                            packageSpecifier.packageName,
                            packageSpecifier.packageVersion,
                        ),
                        requestLanguage,
                    },
                    "Package info cache entry was invalidated after a parse failure.",
                );
            }
        }
        else {
            context.logger.debug(
                {
                    ...withAccountIdentity(account.id, account.endpoint),
                    ...withPackageIdentity(
                        packageSpecifier.packageName,
                        packageSpecifier.packageVersion,
                    ),
                    requestLanguage,
                },
                "Package info cache miss.",
            );
        }
    }
    else {
        context.logger.debug(
            {
                ...withAccountIdentity(account.id, account.endpoint),
                ...withPackageIdentity(packageSpecifier.packageName),
                requestLanguage,
            },
            "Package info cache bypassed for a latest-version lookup.",
        );
    }

    const rawResponse = await requestPackageInfo(
        createPackageInfoRequestUrl(
            account.endpoint,
            packageSpecifier,
            requestLanguage,
        ),
        account.apiKey,
        context,
    );
    const response = parseRawPackageInfoResponse(rawResponse);
    const resolvedCacheKey = createPackageInfoCacheKey(
        account,
        response.packageName,
        response.packageVersion,
        requestLanguage,
    );

    if (!packageInfoCache.has(resolvedCacheKey)) {
        packageInfoCache.set(resolvedCacheKey, JSON.stringify(response));
        context.logger.debug(
            {
                ...withAccountIdentity(account.id, account.endpoint),
                ...withPackageIdentity(
                    response.packageName,
                    response.packageVersion,
                ),
                requestLanguage,
            },
            "Package info response cached.",
        );
    }

    return response;
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

function isSemverVersion(version: string): boolean {
    if (version === "") {
        return false;
    }

    const [versionWithPrerelease, buildMetadata] = splitVersionSection(version, "+");
    const [coreVersion, prerelease] = splitVersionSection(versionWithPrerelease, "-");

    if (!isSemverCore(coreVersion)) {
        return false;
    }

    if (
        prerelease !== undefined
        && !isSemverIdentifiers(prerelease, false)
    ) {
        return false;
    }

    if (
        buildMetadata !== undefined
        && !isSemverIdentifiers(buildMetadata, true)
    ) {
        return false;
    }

    return true;
}

function splitVersionSection(
    value: string,
    separator: string,
): [string, string | undefined] {
    const separatorIndex = value.indexOf(separator);

    if (separatorIndex < 0) {
        return [value, undefined];
    }

    return [
        value.slice(0, separatorIndex),
        value.slice(separatorIndex + separator.length),
    ];
}

function isSemverCore(version: string): boolean {
    const segments = version.split(".");

    if (segments.length !== 3) {
        return false;
    }

    return segments.every(segment => isNumericIdentifier(segment));
}

function isSemverIdentifiers(
    value: string,
    allowLeadingZeroNumeric: boolean,
): boolean {
    if (value === "") {
        return false;
    }

    return value.split(".").every((identifier) => {
        if (!isSemverIdentifier(identifier)) {
            return false;
        }

        if (
            !allowLeadingZeroNumeric
            && isDigits(identifier)
            && identifier.length > 1
            && identifier[0] === "0"
        ) {
            return false;
        }

        return true;
    });
}

function isNumericIdentifier(value: string): boolean {
    if (!isDigits(value)) {
        return false;
    }

    return value.length === 1 || value[0] !== "0";
}

function isDigits(value: string): boolean {
    if (value === "") {
        return false;
    }

    return Array.from(value).every(character => isAsciiDigit(character));
}

function isSemverIdentifier(value: string): boolean {
    if (value === "") {
        return false;
    }

    return Array.from(value).every(character =>
        isAsciiDigit(character)
        || isAsciiLetter(character)
        || character === "-",
    );
}

function isAsciiDigit(character: string): boolean {
    return character >= "0" && character <= "9";
}

function isAsciiLetter(character: string): boolean {
    return (
        (character >= "a" && character <= "z")
        || (character >= "A" && character <= "Z")
    );
}

function createPackageInfoCacheKey(
    account: Pick<AuthAccount, "endpoint" | "id">,
    packageName: string,
    packageVersion: string,
    requestLanguage: RequestLanguage,
): string {
    return JSON.stringify({
        accountId: account.id,
        endpoint: account.endpoint,
        requestLanguage,
        packageName,
        packageVersion,
    });
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
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<string> {
    const requestStartedAt = Date.now();
    const pathSegments = requestUrl.pathname.split("/");
    const packageName = decodeURIComponent(pathSegments.at(-2) ?? "");
    const packageVersion = decodeURIComponent(pathSegments.at(-1) ?? "");

    context.logger.debug(
        {
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            ...withPackageIdentity(packageName, packageVersion),
            requestLanguage: requestUrl.searchParams.get("lang") ?? "",
        },
        "Package info request started.",
    );

    try {
        const response = await context.fetcher(requestUrl, {
            headers: {
                Authorization: apiKey,
            },
        });
        const durationMs = Date.now() - requestStartedAt;

        if (!response.ok) {
            context.logger.warn(
                {
                    durationMs,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    ...withPackageIdentity(packageName, packageVersion),
                    status: response.status,
                },
                "Package info request returned a non-success status.",
            );
            throw new CliUserError("errors.packageInfo.requestFailed", 1, {
                status: response.status,
            });
        }

        context.logger.debug(
            {
                durationMs,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                ...withPackageIdentity(packageName, packageVersion),
                status: response.status,
            },
            "Package info request completed.",
        );

        return await response.text();
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                ...withPackageIdentity(packageName, packageVersion),
            },
            "Package info request failed unexpectedly.",
        );
        throw new CliUserError("errors.packageInfo.requestError", 1, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

function parseCachedPackageInfoResponse(rawResponse: string): PackageInfoResponse {
    try {
        return transformedPackageInfoResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        throw new CliUserError("errors.packageInfo.invalidResponse", 1);
    }
}

function parseRawPackageInfoResponse(rawResponse: string): PackageInfoResponse {
    try {
        const parsedResponse = packageInfoResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );

        return transformedPackageInfoResponseSchema.parse({
            packageName: parsedResponse.packageName,
            packageVersion: parsedResponse.packageVersion,
            description: parsedResponse.description,
            displayName: parsedResponse.title,
            blocks: parsedResponse.blocks.map(block => ({
                blockName: block.blockName,
                title: block.title,
                description: block.description,
                inputHandle: transformInputHandleDefinitions(block.inputHandleDefs),
                outputHandle: transformOutputHandleDefinitions(block.outputHandleDefs),
            })),
        });
    }
    catch {
        throw new CliUserError("errors.packageInfo.invalidResponse", 1);
    }
}

function transformInputHandleDefinitions(
    handleDefs: z.output<typeof packageInfoHandleDefSchema>[],
): Record<string, z.output<typeof transformedInputHandleSchema>> {
    return Object.fromEntries(
        handleDefs.flatMap((handleDef) => {
            if (
                typeof handleDef.handle !== "string"
                || handleDef.handle.trim() === ""
            ) {
                return [];
            }

            const normalizedSchema = splitPackageInfoHandleSchema(handleDef.json_schema);
            const transformedHandle: z.output<typeof transformedInputHandleSchema> = {
                description: handleDef.description,
                schema: normalizedSchema.schema,
            };

            if (normalizedSchema.ext !== undefined) {
                transformedHandle.ext = normalizedSchema.ext;
            }

            if (handleDef.nullable !== undefined) {
                transformedHandle.nullable = handleDef.nullable;
            }

            if (handleDef.value !== undefined) {
                transformedHandle.value = handleDef.value;
            }

            return [[handleDef.handle, transformedHandle]];
        }),
    );
}

function transformOutputHandleDefinitions(
    handleDefs: z.output<typeof packageInfoHandleDefSchema>[],
): Record<string, z.output<typeof transformedOutputHandleSchema>> {
    return Object.fromEntries(
        handleDefs.flatMap((handleDef) => {
            if (
                typeof handleDef.handle !== "string"
                || handleDef.handle.trim() === ""
            ) {
                return [];
            }

            const normalizedSchema = splitPackageInfoHandleSchema(handleDef.json_schema);

            return [[
                handleDef.handle,
                {
                    description: handleDef.description,
                    ext: normalizedSchema.ext,
                    schema: normalizedSchema.schema,
                },
            ]];
        }),
    );
}

function splitPackageInfoHandleSchema(
    value: unknown,
): { schema: unknown; ext?: Record<string, unknown> } {
    const normalizedValue = splitPackageInfoSchemaNode(value);

    if (!isPackageInfoSchemaObject(normalizedValue.ext)) {
        return {
            schema: normalizedValue.schema,
        };
    }

    return {
        ext: normalizedValue.ext,
        schema: normalizedValue.schema,
    };
}

function splitPackageInfoSchemaNode(
    value: unknown,
): { schema: unknown; ext?: unknown } {
    if (Array.isArray(value)) {
        const schemaItems: unknown[] = [];
        const extItems: unknown[] = [];
        let hasExt = false;

        for (const item of value) {
            const normalizedItem = splitPackageInfoSchemaNode(item);

            schemaItems.push(normalizedItem.schema);

            if (normalizedItem.ext === undefined) {
                extItems.push(null);
                continue;
            }

            hasExt = true;
            extItems.push(normalizedItem.ext);
        }

        return hasExt
            ? { schema: schemaItems, ext: extItems }
            : { schema: schemaItems };
    }

    if (value === null || typeof value !== "object") {
        return { schema: value };
    }

    const schemaEntries: [string, unknown][] = [];
    const extEntries: [string, unknown][] = [];

    for (const [key, nestedValue] of Object.entries(value)) {
        if (key.startsWith("ui:")) {
            const uiKey = key.slice("ui:".length);

            if (uiKey !== "") {
                extEntries.push([uiKey, normalizePackageInfoExtensionValue(nestedValue)]);
                continue;
            }
        }

        const normalizedValue = splitPackageInfoSchemaNode(nestedValue);

        schemaEntries.push([key, normalizedValue.schema]);

        if (normalizedValue.ext !== undefined) {
            extEntries.push([key, normalizedValue.ext]);
        }
    }

    if (extEntries.length === 0) {
        return { schema: Object.fromEntries(schemaEntries) };
    }

    return {
        ext: Object.fromEntries(extEntries),
        schema: Object.fromEntries(schemaEntries),
    };
}

function normalizePackageInfoExtensionValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => normalizePackageInfoExtensionValue(item));
    }

    if (value === null || typeof value !== "object") {
        return value;
    }

    const normalizedEntries: [string, unknown][] = [];

    for (const [key, nestedValue] of Object.entries(value)) {
        if (key.startsWith("ui:")) {
            const uiKey = key.slice("ui:".length);

            if (uiKey !== "") {
                normalizedEntries.push([uiKey, normalizePackageInfoExtensionValue(nestedValue)]);
                continue;
            }
        }

        normalizedEntries.push([key, normalizePackageInfoExtensionValue(nestedValue)]);
    }

    return Object.fromEntries(normalizedEntries);
}

function hasPackageInfoSchemaDefault(schema: unknown): boolean {
    return isPackageInfoSchemaObject(schema) && Object.hasOwn(schema, "default");
}

function isPackageInfoSchemaObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
