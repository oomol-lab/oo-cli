import type { CliCommandDefinition, CliExecutionContext } from "../contracts/cli.ts";
import type {
    InstallationMethod,
    PackageManagerInstallationMethod,
} from "../self-update/installation.ts";
import type { UninstallPlan, UninstallPlanItem } from "../self-update/uninstall.ts";

import process from "node:process";
import { z } from "zod";
import { CliUserError } from "../contracts/cli.ts";
import {
    buildSelfUninstallPlan,
    performSelfUninstall,
} from "../self-update/uninstall.ts";
import { bucketTelemetryCount } from "../telemetry/buckets.ts";
import { writeLine } from "./shared/output.ts";
import { confirmInteractiveValue } from "./skills/interactive-prompts.ts";

interface UninstallInput {
    dryRun?: boolean;
    purge?: boolean;
    yes?: boolean;
}

const uninstallInputSchema = z.object({
    dryRun: z.boolean().optional(),
    purge: z.boolean().optional(),
    yes: z.boolean().optional(),
});

const packageManagerUninstallCommands: Record<
    PackageManagerInstallationMethod,
    string
> = {
    bun: "bun remove -g @oomol-lab/oo-cli",
    npm: "npm uninstall -g @oomol-lab/oo-cli",
    pnpm: "pnpm remove -g @oomol-lab/oo-cli",
    yarn: "yarn global remove @oomol-lab/oo-cli",
};

export const uninstallCommand: CliCommandDefinition<UninstallInput> = {
    name: "uninstall",
    summaryKey: "commands.uninstall.summary",
    descriptionKey: "commands.uninstall.description",
    options: [
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.uninstall.yes",
        },
        {
            name: "dryRun",
            longFlag: "--dry-run",
            descriptionKey: "options.uninstall.dryRun",
        },
        {
            name: "purge",
            longFlag: "--purge",
            descriptionKey: "options.uninstall.purge",
        },
    ],
    inputSchema: uninstallInputSchema,
    handler: async (input, context) => {
        const purge = input.purge === true;
        const plan = await buildSelfUninstallPlan({
            env: context.env,
            execPath: context.execPath,
            platform: process.platform,
            purge,
            version: context.version,
        });

        context.telemetry?.recordProperties({
            has_purge: purge,
            installation_method: plan.installationMethod,
            item_count_bucket: bucketTelemetryCount(
                plan.immediate.length + plan.deferred.length,
            ),
        });

        // `--purge` deletes the config root, which contains the telemetry
        // directory. Suppress this invocation's telemetry so the teardown flush
        // does not re-create the directory we just removed.
        if (purge && input.dryRun !== true) {
            context.telemetry?.suppressCurrentInvocation();
        }

        if (input.dryRun === true) {
            writeUninstallPlan(context, plan);
            return;
        }

        const hasItems = plan.immediate.length + plan.deferred.length > 0;

        // Only native installs short-circuit on an empty plan. For
        // package-manager / unknown installs there is still binary-removal
        // guidance to surface (and a non-zero exit), even with nothing to delete.
        if (!hasItems && plan.installationMethod === "native") {
            writeLine(context.stdout, context.translator.t("uninstall.plan.nothing"));
            return;
        }

        let deferredToHelper = false;

        if (hasItems) {
            if (!(await confirmUninstall(input, plan, context))) {
                return;
            }

            const result = await performSelfUninstall({
                logger: context.logger,
                plan,
                processId: process.pid,
                timestamp: Date.now(),
            });

            if (result.status === "busy") {
                throw new CliUserError("uninstall.busy", 1, {
                    pid: result.ownerPid ?? 0,
                });
            }

            if (result.failedPaths.length > 0) {
                throw new CliUserError("uninstall.partialFailure", 1, {
                    count: result.failedPaths.length,
                });
            }

            deferredToHelper = result.deferredToHelper;
        }

        writeUninstallResult(context, plan, deferredToHelper);
    },
};

async function confirmUninstall(
    input: UninstallInput,
    plan: UninstallPlan,
    context: CliExecutionContext,
): Promise<boolean> {
    if (input.yes === true) {
        return true;
    }

    if (context.stdin.isTTY !== true || context.stdout.isTTY !== true) {
        throw new CliUserError("uninstall.error.confirmationRequired", 1);
    }

    writeUninstallPlan(context, plan);

    const confirmed = await confirmInteractiveValue(context, {
        invalidMessage: context.translator.t("uninstall.confirm.invalid"),
        prompt: context.translator.t(
            plan.purge
                ? "uninstall.confirm.purgePrompt"
                : "uninstall.confirm.prompt",
        ),
    });

    if (!confirmed) {
        writeLine(context.stdout, context.translator.t("uninstall.confirm.cancelled"));
        return false;
    }

    return true;
}

function writeUninstallPlan(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    plan: UninstallPlan,
): void {
    writeLine(context.stdout, context.translator.t("uninstall.plan.header"));

    writePlanSection(context, "uninstall.plan.removeRuntime", plan.immediate, item =>
        item.category === "binary"
        || item.category === "versions"
        || item.category === "staging"
        || item.category === "locks");
    writePlanSection(context, "uninstall.plan.removeSkills", plan.immediate, item =>
        item.category === "bundled-skill" || item.category === "registry-skill");
    writePlanSection(context, "uninstall.plan.removeData", plan.immediate, item =>
        item.category === "user-data");

    if (plan.deferred.length > 0) {
        writeLine(context.stdout, context.translator.t("uninstall.plan.deferred"));
        for (const item of plan.deferred) {
            writePlanItem(context, item);
        }
    }

    if (plan.retainedSkills.length > 0) {
        writeLine(context.stdout, context.translator.t("uninstall.plan.retained"));
        for (const retained of plan.retainedSkills) {
            writeLine(
                context.stdout,
                context.translator.t(
                    `uninstall.plan.retainedSkill.${retained.reason}`,
                    { path: retained.path },
                ),
            );
        }
    }
}

function writePlanSection(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    headerKey: string,
    items: readonly UninstallPlanItem[],
    predicate: (item: UninstallPlanItem) => boolean,
): void {
    const matched = items.filter(predicate);

    if (matched.length === 0) {
        return;
    }

    writeLine(context.stdout, context.translator.t(headerKey));
    for (const item of matched) {
        writePlanItem(context, item);
    }
}

function writePlanItem(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    item: UninstallPlanItem,
): void {
    writeLine(
        context.stdout,
        context.translator.t("uninstall.plan.item", {
            label: item.label,
            path: item.path,
        }),
    );
}

function writeUninstallResult(
    context: CliExecutionContext,
    plan: UninstallPlan,
    deferredToHelper: boolean,
): void {
    if (plan.installationMethod !== "native") {
        // Skills (and, under --purge, user data) were removed, but the binary
        // itself is owned by a package manager or lives at an unknown path.
        // Surface guidance and a non-zero exit so callers know the binary
        // still needs to be removed manually.
        throw createPackageManagerGuidanceError(plan.installationMethod);
    }

    if (deferredToHelper) {
        writeLine(
            context.stdout,
            context.translator.t("uninstall.success.scheduled"),
        );
        return;
    }

    writeLine(context.stdout, context.translator.t("uninstall.success"));
}

function createPackageManagerGuidanceError(
    method: InstallationMethod,
): CliUserError {
    if (method === "unknown") {
        return new CliUserError("uninstall.unknown", 1);
    }

    return new CliUserError("uninstall.packageManager", 1, {
        command: resolvePackageManagerCommand(method),
        method,
    });
}

function resolvePackageManagerCommand(method: InstallationMethod): string {
    return packageManagerUninstallCommands[method as PackageManagerInstallationMethod]
        ?? packageManagerUninstallCommands.npm;
}
