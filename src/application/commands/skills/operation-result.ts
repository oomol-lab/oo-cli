import type { CliOptionDefinition, Writer } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";

export const skillOperationOutputOptions
    = jsonOutputOptions satisfies readonly CliOptionDefinition[];

export type SkillKind = "bundled" | "registry" | "local" | "unknown";

export type CommandStatus
    = | "completed"
        | "partial-failure"
        | "failed"
        | "noop";

export type PreviousState
    = | "absent"
        | "managed"
        | "unmanaged"
        | "unknown";

export interface SkillOperationError {
    code: string;
    message: string;
}

export interface SkillTargetResult {
    agentId: BundledSkillAgentName;
    status: string;
    path: string;
    sourcePath: string | null;
    canonicalPath?: string | null;
    version: string | null;
    previousVersion?: string | null;
    previousState?: PreviousState;
    error?: SkillOperationError;
}

export interface SkillResult {
    skillId: string;
    kind: SkillKind;
    packageName: string | null;
    previousVersion: string | null;
    version: string | null;
    status: string;
    targets: SkillTargetResult[];
    error?: SkillOperationError;
}

export interface SkillSyncRecordResult {
    skillId: string;
    packageName: string;
    version: string;
}

export interface InstallReport {
    command: "skills.install";
    status: CommandStatus;
    summary: {
        requestedSkills: number;
        installed: number;
        skipped: number;
        failed: number;
    };
    skills: SkillResult[];
    errors: SkillOperationError[];
}

export interface UninstallReport {
    command: "skills.uninstall";
    status: CommandStatus;
    summary: {
        requestedSkills: number;
        removed: number;
        skipped: number;
        failed: number;
    };
    skills: SkillResult[];
    errors: SkillOperationError[];
}

export interface UpdateReport {
    command: "skills.update";
    status: CommandStatus;
    summary: {
        requestedSkills: number;
        updated: number;
        repaired: number;
        current: number;
        failed: number;
    };
    skills: SkillResult[];
    errors: SkillOperationError[];
}

export interface SyncUploadReport {
    command: "skills.sync.upload";
    status: CommandStatus;
    summary: {
        recordsUploaded: number;
        recordsIgnored: number;
        failed: number;
    };
    records: SkillSyncRecordResult[];
    errors: SkillOperationError[];
}

export interface SyncApplyReport {
    command: "skills.sync.apply";
    status: CommandStatus;
    summary: {
        recordsDownloaded: number;
        installed: number;
        current: number;
        failed: number;
    };
    skills: SkillResult[];
    errors: SkillOperationError[];
}

export type SkillOperationReport
    = | InstallReport
        | UninstallReport
        | UpdateReport
        | SyncUploadReport
        | SyncApplyReport;

export function writeSkillOperationJson(
    writer: Writer,
    report: SkillOperationReport,
    options: { showSchemaVersion?: boolean | undefined } = {},
): void {
    writeJsonOutput(writer, report, { showSchemaVersion: options.showSchemaVersion });
}

export function computeCommandStatus(args: {
    succeeded: number;
    failed: number;
    commandLevelErrors: number;
    noopWhenEmpty?: boolean;
}): CommandStatus {
    if (args.failed > 0 || args.commandLevelErrors > 0) {
        return args.succeeded > 0 ? "partial-failure" : "failed";
    }

    if (args.succeeded === 0 && args.noopWhenEmpty === true) {
        return "noop";
    }

    return "completed";
}
