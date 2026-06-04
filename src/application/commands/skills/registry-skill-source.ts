import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { performLoggedRequest, requestText } from "../shared/request.ts";

const registryPackageNotFoundStatus = 404;

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

export function createRegistryPackageInfoRequestUrl(
    endpoint: string,
    packageName: string,
    packageVersion = "latest",
): URL {
    return new URL(
        `https://registry.${endpoint}/-/oomol/package-info/${encodeURIComponent(packageName)}/${encodeURIComponent(packageVersion)}`,
    );
}

export function createRegistryPackageTarballRequestUrl(
    endpoint: string,
    packageName: string,
    packageVersion: string,
): URL {
    const packagePath = encodeURI(packageName);
    const tarballPackageName = resolveRegistryPackageTarballPackageName(packageName);

    return new URL(
        `https://registry.${endpoint}/${packagePath}/-/meta/${encodeURIComponent(tarballPackageName)}-${encodeURIComponent(packageVersion)}.tgz`,
    );
}

export function createRegistryPackageShareDownloadMetaRequestUrl(
    endpoint: string,
    packageShareId: string,
): URL {
    return new URL(
        `https://registry.${endpoint}/-/oomol/package-shares/download-meta/${encodeURIComponent(packageShareId)}`,
    );
}

export function createRegistryPackageDownloadCountRequestUrl(
    endpoint: string,
    packageName: string,
    packageVersion: string,
): URL {
    const packagePath = encodeURI(packageName);

    return new URL(
        `https://registry.${endpoint}/-/oomol/packages/${packagePath}/${encodeURIComponent(packageVersion)}/download-count`,
    );
}

export async function loadRegistryPackageSkillInfo(
    packageName: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
    packageVersion = "latest",
): Promise<RegistryPackageSkillInfo> {
    const requestUrl = createRegistryPackageInfoRequestUrl(
        account.endpoint,
        packageName,
        packageVersion,
    );
    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.skills.install.packageInfoRequestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.skills.install.packageInfoRequestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            common: withPackageIdentity(packageName, packageVersion),
        },
        init: {
            headers: {
                Authorization: account.apiKey,
            },
        },
        requestLabel: "Skills install package info",
        requestUrl,
    });

    return parseRegistryPackageSkillInfo(rawResponse);
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
    const requestUrl = createRegistryPackageInfoRequestUrl(
        endpoint,
        packageName,
        packageVersion,
    );
    const response = await performLoggedRequest({
        allowedStatuses: [registryPackageNotFoundStatus],
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.skills.install.packageInfoRequestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.skills.install.packageInfoRequestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            common: withPackageIdentity(packageName, packageVersion),
        },
        requestLabel: "Skills recommend package info",
        requestUrl,
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
    const requestUrl = packageShareId === undefined
        ? createRegistryPackageTarballRequestUrl(
                account.endpoint,
                packageName,
                packageVersion,
            )
        : createRegistryPackageShareDownloadMetaRequestUrl(
                account.endpoint,
                packageShareId,
            );
    const response = await performLoggedRequest({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.skills.install.packageDownloadFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.skills.install.packageDownloadError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            common: withPackageIdentity(packageName, packageVersion),
        },
        init: {
            headers: {
                Authorization: account.apiKey,
            },
        },
        requestLabel: "Skills install package download",
        requestUrl,
    });

    return new Uint8Array(await response.arrayBuffer());
}

export async function tryReportRegistryPackageDownload(
    packageName: string,
    packageVersion: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<void> {
    const requestUrl = createRegistryPackageDownloadCountRequestUrl(
        account.endpoint,
        packageName,
        packageVersion,
    );

    try {
        await performLoggedRequest({
            context,
            createRequestFailedError: status => new CliUserError(
                "errors.skills.install.packageDownloadFailed",
                1,
                {
                    status,
                },
            ),
            createUnexpectedError: error => new CliUserError(
                "errors.skills.install.packageDownloadError",
                1,
                {
                    message: error instanceof Error ? error.message : String(error),
                },
            ),
            fields: {
                common: withPackageIdentity(packageName, packageVersion),
            },
            init: {
                headers: {
                    "Authorization": account.apiKey,
                    "Content-Type": "application/json",
                },
                method: "POST",
            },
            requestLabel: "Skills install package download count",
            requestUrl,
        });
    }
    catch {
    }
}

function parseRegistryPackageSkillInfo(
    rawResponse: string,
): RegistryPackageSkillInfo {
    try {
        const parsedResponse = registryPackageSkillInfoSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
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
    }
    catch {
        throw new CliUserError("errors.skills.install.invalidPackageInfo", 1);
    }
}

function resolveRegistryPackageTarballPackageName(packageName: string): string {
    if (!packageName.startsWith("@")) {
        return packageName;
    }

    const scopeSeparatorIndex = packageName.indexOf("/");

    if (scopeSeparatorIndex < 0 || scopeSeparatorIndex === packageName.length - 1) {
        return packageName;
    }

    return packageName.slice(scopeSeparatorIndex + 1);
}
