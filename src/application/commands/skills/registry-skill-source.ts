import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { redactedLogValue } from "../../logging/url-sanitizer.ts";
import { requestOo, requestOoResponse } from "../shared/oo-request.ts";

const registryPackageNotFoundStatus = 404;

// The irregular skills.install request-error keys predate the shared triplet
// convention; both key families keep their historical names.
const registryPackageInfoErrors = {
    invalidResponse: "errors.skills.install.invalidPackageInfo",
    requestError: "errors.skills.install.packageInfoRequestError",
    requestFailed: "errors.skills.install.packageInfoRequestFailed",
} as const;

const registryPackageDownloadErrors = {
    requestError: "errors.skills.install.packageDownloadError",
    requestFailed: "errors.skills.install.packageDownloadFailed",
} as const;

const registrySkillSchema = z.object({
    description: z.string().optional().default(""),
    name: z.string().min(1),
    title: z.string().optional().default(""),
}).passthrough();

const registryPackageSkillInfoSchema = z.object({
    packageName: z.string().min(1),
    packageVersion: z.string().optional(),
    skills: z.array(registrySkillSchema).optional().default([]),
    version: z.string().optional(),
}).passthrough();

export interface RegistrySkillSummary {
    description: string;
    name: string;
    title: string;
}

export interface RegistryPackageSkillInfo {
    packageName: string;
    packageVersion: string;
    skills: RegistrySkillSummary[];
}

export function createRegistryPackageInfoPath(
    packageName: string,
    packageVersion = "latest",
): string {
    return `/-/oomol/package-info/${encodeURIComponent(packageName)}/${encodeURIComponent(packageVersion)}`;
}

export function createRegistryPackageTarballPath(
    packageName: string,
    packageVersion: string,
): string {
    const packagePath = encodeURI(packageName);
    const tarballPackageName = resolveRegistryPackageTarballPackageName(packageName);

    return `/${packagePath}/-/meta/${encodeURIComponent(tarballPackageName)}-${encodeURIComponent(packageVersion)}.tgz`;
}

export function createRegistryPackageShareDownloadMetaPath(
    packageShareId: string,
): string {
    return `/-/oomol/package-shares/download-meta/${encodeURIComponent(packageShareId)}`;
}

export function createRegistryPackageDownloadCountPath(
    packageName: string,
    packageVersion: string,
): string {
    const packagePath = encodeURI(packageName);

    return `/-/oomol/packages/${packagePath}/${encodeURIComponent(packageVersion)}/download-count`;
}

// Decodes the package-info body: zod shape plus the version-presence rule the
// schema alone cannot express. Throws raw on any mismatch, so requestOo maps
// it to the invalidPackageInfo key like any other decode failure.
const registryPackageSkillInfoResponse = {
    parse(input: unknown): RegistryPackageSkillInfo {
        const parsedResponse = registryPackageSkillInfoSchema.parse(input);
        const packageVersion = parsedResponse.packageVersion?.trim()
            || parsedResponse.version?.trim()
            || "";

        if (packageVersion === "") {
            throw new Error("Missing package version.");
        }

        return {
            packageName: parsedResponse.packageName,
            packageVersion,
            skills: parsedResponse.skills.map(skill => ({
                description: skill.description,
                name: skill.name,
                title: skill.title === "" ? skill.name : skill.title,
            })),
        };
    },
};

export async function loadRegistryPackageSkillInfo(
    packageName: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    packageVersion = "latest",
): Promise<RegistryPackageSkillInfo> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: registryPackageInfoErrors,
        host: { endpoint: account.endpoint, service: "registry" },
        label: "Skills install package info",
        logFields: {
            common: withPackageIdentity(packageName, packageVersion),
        },
        path: createRegistryPackageInfoPath(packageName, packageVersion),
        schema: registryPackageSkillInfoResponse,
    });
}

// Like loadRegistryPackageSkillInfo, but unauthenticated and 404-aware: the
// package-info endpoint is public, so no Authorization header is sent, and a
// 404 is treated as a definitive "the package does not exist" signal instead of
// an error. Used to confirm a derived `oo-<service>` package is published before
// recommending it. Other non-success statuses and network errors still throw.
export async function loadRegistryPackageSkillInfoAllowingMissing(
    packageName: string,
    endpoint: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    packageVersion = "latest",
): Promise<RegistryPackageSkillInfo | "not-found"> {
    const response = await requestOoResponse({
        allowedStatuses: [registryPackageNotFoundStatus],
        context,
        errors: registryPackageInfoErrors,
        host: { endpoint, service: "registry" },
        label: "Skills recommend package info",
        logFields: {
            common: withPackageIdentity(packageName, packageVersion),
        },
        path: createRegistryPackageInfoPath(packageName, packageVersion),
    });

    if (response.status === registryPackageNotFoundStatus) {
        return "not-found";
    }

    return parseRegistryPackageSkillInfo(await response.text());
}

export async function downloadRegistryPackageTarball(
    packageName: string,
    packageVersion: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    packageShareId?: string,
): Promise<Uint8Array<ArrayBuffer>> {
    const response = await requestOoResponse({
        authorization: account.apiKey,
        context,
        errors: registryPackageDownloadErrors,
        host: { endpoint: account.endpoint, service: "registry" },
        label: "Skills install package download",
        logFields: {
            common: {
                ...withPackageIdentity(packageName, packageVersion),
                // The share id is a download credential embedded in the path;
                // override the request-target path field with a redacted form.
                ...(packageShareId === undefined
                    ? {}
                    : { path: createRegistryPackageShareDownloadMetaPath(redactedLogValue) }),
            },
        },
        path: packageShareId === undefined
            ? createRegistryPackageTarballPath(packageName, packageVersion)
            : createRegistryPackageShareDownloadMetaPath(packageShareId),
    });

    return new Uint8Array(await response.arrayBuffer());
}

export async function tryReportRegistryPackageDownload(
    packageName: string,
    packageVersion: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<void> {
    try {
        await requestOoResponse({
            authorization: account.apiKey,
            context,
            errors: registryPackageDownloadErrors,
            // The historical wire shape sends a JSON content type with no body.
            headers: {
                "Content-Type": "application/json",
            },
            host: { endpoint: account.endpoint, service: "registry" },
            label: "Skills install package download count",
            logFields: {
                common: withPackageIdentity(packageName, packageVersion),
            },
            method: "POST",
            path: createRegistryPackageDownloadCountPath(packageName, packageVersion),
        });
    }
    catch {
    }
}

function parseRegistryPackageSkillInfo(
    rawResponse: string,
): RegistryPackageSkillInfo {
    try {
        return registryPackageSkillInfoResponse.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        throw new CliUserError(registryPackageInfoErrors.invalidResponse, 1);
    }
}

// npm serves a scoped package's tarball under its unscoped name.
export function resolveRegistryPackageTarballPackageName(packageName: string): string {
    if (!packageName.startsWith("@")) {
        return packageName;
    }

    const scopeSeparatorIndex = packageName.indexOf("/");

    if (scopeSeparatorIndex < 0 || scopeSeparatorIndex === packageName.length - 1) {
        return packageName;
    }

    return packageName.slice(scopeSeparatorIndex + 1);
}
