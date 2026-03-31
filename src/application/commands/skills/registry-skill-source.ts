import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { performLoggedRequest, requestText } from "../shared/request.ts";

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

export async function requireCurrentSkillsInstallAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    return requireCurrentAccount(context, "errors.skills.install.authRequired", "errors.skills.install.activeAccountMissing");
}

export function createRegistryPackageInfoRequestUrl(
    endpoint: string,
    packageName: string,
): URL {
    return new URL(
        `https://registry.${endpoint}/-/oomol/package-info/${encodeURIComponent(packageName)}/latest`,
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

export async function loadRegistryPackageSkillInfo(
    packageName: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<RegistryPackageSkillInfo> {
    const requestUrl = createRegistryPackageInfoRequestUrl(
        account.endpoint,
        packageName,
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
            common: withPackageIdentity(packageName, "latest"),
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

export async function downloadRegistryPackageTarball(
    packageName: string,
    packageVersion: string,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<Uint8Array<ArrayBuffer>> {
    const requestUrl = createRegistryPackageTarballRequestUrl(
        account.endpoint,
        packageName,
        packageVersion,
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
