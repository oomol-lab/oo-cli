import type { ZodError } from "zod";
import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";
import type { TeamIdentity } from "../team/identity.ts";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { readDefaultTeam } from "../../auth/default-team.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { requestOo, requestOoResponse } from "../shared/oo-request.ts";
import { readStdinToEnd } from "../shared/stdin.ts";
import {
    assertTeamIdentityFlags,
    requireValidTeamIdentity,
    resolveTeamIdentity,
    teamIdentityHeaders,
} from "../team/identity.ts";

export const MAX_VARIABLE_NAME_LENGTH = 256;
export const MAX_VARIABLE_VALUE_BYTES = 65536;

export interface Variable {
    name: string;
    value: string;
    updatedAt: string;
    // The user who last wrote the variable, reported by the service as an
    // audit hint. Optional so a backend that predates team-scoped variables
    // still parses.
    updatedBy?: string;
}

type RequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
type VariableAccount = Pick<AuthAccount, "apiKey" | "endpoint">;

type VariablesIdentityContext = Pick<
    CliExecutionContext,
    | "authStore"
    | "env"
    | "fetcher"
    | "logger"
    | "settingsStore"
    | "telemetry"
    | "translator"
>;

interface VariablesIdentityInput {
    personal?: boolean;
    team?: string;
}

// MARK: - Validation

function hasControlCharacter(value: string): boolean {
    return [...value].some((char) => {
        const code = char.charCodeAt(0);
        return code < 0x20 || code === 0x7F;
    });
}

export const variableNameSchema = z.string()
    .trim()
    .min(1)
    .max(MAX_VARIABLE_NAME_LENGTH)
    .refine(name => !name.includes("/"), "Variable name must not contain '/'")
    .refine(name => !hasControlCharacter(name), "Variable name must not contain control characters");

// Name is the only fallible field in the variables schemas, so every zod
// failure maps to the invalid-name error.
export function mapVariablesInputError(
    _error: ZodError,
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.variables.invalidName", 2, {
        value: String(rawInput.name ?? ""),
    });
}

// MARK: - Value source resolution (exactly one of: positional / --from-file / --stdin)

export interface VariableValueSourceInput {
    value?: string;
    fromFile?: string;
    stdin?: boolean;
}

export async function resolveVariableValue(
    input: VariableValueSourceInput,
    context: Pick<CliExecutionContext, "stdin">,
): Promise<string> {
    const sourceCount = [
        input.value !== undefined,
        input.fromFile !== undefined,
        input.stdin === true,
    ].filter(Boolean).length;

    if (sourceCount !== 1) {
        throw new CliUserError("errors.variables.valueSource", 2);
    }

    let value: string;

    if (input.stdin === true) {
        if (context.stdin.isTTY === true) {
            throw new CliUserError("errors.variables.stdinTty", 2);
        }

        value = await readStdinToEnd(context.stdin);
    }
    else if (input.fromFile !== undefined) {
        try {
            value = await readFile(input.fromFile, "utf8");
        }
        catch (error) {
            throw new CliUserError("errors.variables.fromFileReadFailed", 2, {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    else {
        value = input.value ?? "";
    }

    if (Buffer.byteLength(value, "utf8") > MAX_VARIABLE_VALUE_BYTES) {
        throw new CliUserError("errors.variables.valueTooLarge", 2, {
            max: MAX_VARIABLE_VALUE_BYTES,
        });
    }

    return value;
}

// MARK: - Team identity

/**
 * Resolves the team the variables commands act for: the shared flag guards,
 * the one shared identity ladder (`--personal` > `--team` > `OO_TEAM_ID` >
 * `OO_TEAM_NAME` > the account default), its execution gate, and the identity
 * telemetry — everything the four subcommands must agree on.
 *
 * `undefined` means no team header is sent, which lets the gateway apply the
 * server-side default team; it is not a private, per-user scope.
 */
export async function resolveVariablesIdentity(
    input: VariablesIdentityInput,
    account: VariableAccount,
    context: VariablesIdentityContext,
): Promise<TeamIdentity | undefined> {
    const teamFlag = assertTeamIdentityFlags(input);

    const identity = requireValidTeamIdentity(
        await resolveTeamIdentity(
            {
                account,
                defaultTeam: await readDefaultTeam(context),
                teamFlag,
                personalFlag: input.personal === true,
                resolveAgainstBackend: true,
            },
            context,
        ),
        context,
    );

    context.telemetry?.recordProperties({
        identity_source: identity?.source ?? "personal",
    });

    return identity;
}

// MARK: - Requests

const variableSchema = z.object({
    name: z.string(),
    value: z.string(),
    updatedAt: z.string(),
    updatedBy: z.string().optional(),
});

const variableListSchema = z.object({
    variables: z.array(variableSchema),
});

function variablePath(name?: string): string {
    return name === undefined
        ? "/v1/variables"
        : `/v1/variables/${encodeURIComponent(name)}`;
}

export async function listVariables(
    account: VariableAccount,
    identity: TeamIdentity | undefined,
    context: RequestContext,
): Promise<Variable[]> {
    const parsed = await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        headers: teamIdentityHeaders(identity),
        host: { endpoint: account.endpoint, service: "cli-api" },
        label: "Variables list",
        path: variablePath(),
        schema: variableListSchema,
        statusErrors: mapVariablesTeamError,
    });

    return parsed.variables;
}

export async function getVariable(
    account: VariableAccount,
    identity: TeamIdentity | undefined,
    name: string,
    context: RequestContext,
): Promise<Variable> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        headers: teamIdentityHeaders(identity),
        host: { endpoint: account.endpoint, service: "cli-api" },
        label: "Variables get",
        path: variablePath(name),
        schema: variableSchema,
        statusErrors: failure => mapVariablesTeamError(failure)
            ?? (failure.status === 404
                ? new CliUserError("errors.variables.notFound", 1, { name })
                : undefined),
    });
}

export async function putVariable(
    account: VariableAccount,
    identity: TeamIdentity | undefined,
    name: string,
    value: string,
    context: RequestContext,
): Promise<Variable> {
    return await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        headers: teamIdentityHeaders(identity),
        host: { endpoint: account.endpoint, service: "cli-api" },
        jsonBody: { value },
        label: "Variables create",
        method: "PUT",
        path: variablePath(name),
        schema: variableSchema,
        statusErrors: failure => mapVariablesTeamError(failure)
            ?? (failure.status === 409
                ? new CliUserError("errors.variables.quotaExceeded", 1)
                : undefined),
    });
}

export async function deleteVariable(
    account: VariableAccount,
    identity: TeamIdentity | undefined,
    name: string,
    context: RequestContext,
): Promise<void> {
    await requestOoResponse({
        authorization: account.apiKey,
        context,
        errors: { scope: "variables" },
        headers: teamIdentityHeaders(identity),
        host: { endpoint: account.endpoint, service: "cli-api" },
        label: "Variables delete",
        method: "DELETE",
        path: variablePath(name),
        statusErrors: mapVariablesTeamError,
    });
}

// The service phrase that separates "this account belongs to no team at all"
// from every other 401. The gateway only omits the team context when the
// account has no team to fall back on, so no flag can fix it.
const teamContextRequiredMessage = "Team context required";

// The team-context refusals every variables request shares. A 401 naming the
// missing team context means the account has no team; a 403 means the selected
// team refused the account (not a member, or no such team); a 503 means the
// gateway could not verify the team at all, which is worth retrying. Every
// other status stays on the generic request failure.
function mapVariablesTeamError(
    failure: OoRequestFailure,
): CliUserError | undefined {
    if (
        failure.status === 401
        && failure.bodyText?.includes(teamContextRequiredMessage) === true
    ) {
        return new CliUserError("errors.variables.teamRequired", 1);
    }

    if (failure.status === 403) {
        return new CliUserError("errors.variables.teamAccessDenied", 1);
    }

    return failure.status === 503
        ? new CliUserError("errors.variables.teamUnavailable", 1)
        : undefined;
}
