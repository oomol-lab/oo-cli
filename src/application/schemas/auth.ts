import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

export const authAccountSchema = z.object({
    apiKey: z.string().min(1),
    endpoint: z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
    // The account's default team identity. `team` is the name every backend
    // understands; `teamId` is the exact value and may be absent on accounts
    // whose default was migrated from the legacy global setting.
    team: z.string().min(1).optional(),
    teamId: z.string().min(1).optional(),
}).strict();

export const authFileSchema = z.object({
    auth: z.array(authAccountSchema),
    id: z.string(),
}).strict();

// The default team fields, as they appear on disk. They are read leniently on
// purpose: a hand-edited blank value must degrade to "no default team", not
// brick every command that needs a credential.
const authAccountTeamTomlShape = {
    team: z.string().optional(),
    team_id: z.string().optional(),
};

// Neither branch is strict: an auth.toml written by a newer CLI carries keys
// this version has never heard of, and rejecting the whole file over one of
// them would report the saved accounts as corrupt.
const authAccountTomlSchema = z.union([
    z.object({
        api_key: z.string().min(1),
        endpoint: z.string().min(1),
        id: z.string().min(1),
        name: z.string().min(1),
        ...authAccountTeamTomlShape,
    }),
    z.object({
        // Support legacy auth.toml files that used uppercase account ids.
        ID: z.string().min(1),
        api_key: z.string().min(1),
        endpoint: z.string().min(1),
        name: z.string().min(1),
        ...authAccountTeamTomlShape,
    }),
]).transform(account => ({
    apiKey: account.api_key,
    endpoint: account.endpoint,
    id: "id" in account ? account.id : account.ID,
    name: account.name,
    ...optionalTeamFields(account.team, account.team_id),
}));

export const authTomlFileSchema = z.object({
    auth: z.array(authAccountTomlSchema).optional().default([]),
    id: z.string().optional().default(""),
}).strict();

export type AuthAccount = z.output<typeof authAccountSchema>;
export type AuthFile = z.output<typeof authFileSchema>;

export const defaultAuthFile: AuthFile = {
    auth: [],
    id: "",
};

export function renderAuthFile(authFile: AuthFile): string {
    const lines = [renderTomlLine("id", authFile.id)];

    for (const account of authFile.auth) {
        lines.push(
            "",
            "[[auth]]",
            renderTomlLine("id", account.id),
            renderTomlLine("name", account.name),
            renderTomlLine("api_key", account.apiKey),
            renderTomlLine("endpoint", account.endpoint),
        );

        if (account.team !== undefined) {
            lines.push(renderTomlLine("team", account.team));
        }

        if (account.teamId !== undefined) {
            lines.push(renderTomlLine("team_id", account.teamId));
        }
    }

    return `${lines.join("\n")}\n`;
}

/**
 * Saves an account, preserving the default team already stored for it. A
 * re-login sends a freshly built account with no team fields, and dropping
 * them there would silently reset a team identity the user deliberately
 * chose; the login flow decides what the default should become afterwards.
 */
export function upsertAuthAccount(
    authFile: AuthFile,
    account: AuthAccount,
): AuthFile {
    const existingIndex = authFile.auth.findIndex(
        currentAccount => currentAccount.id === account.id,
    );

    if (existingIndex === -1) {
        return {
            auth: [...authFile.auth, account],
            id: account.id,
        };
    }

    const existingAccount = authFile.auth[existingIndex]!;
    const mergedAccount: AuthAccount = {
        ...account,
        ...optionalTeamFields(
            account.team ?? existingAccount.team,
            account.teamId ?? existingAccount.teamId,
        ),
    };

    return {
        auth: authFile.auth.map((currentAccount, index) =>
            index === existingIndex ? mergedAccount : currentAccount,
        ),
        id: account.id,
    };
}

/**
 * Records the default team identity on one account. The id is stored only
 * when known, so a default migrated from the legacy global setting (which
 * only ever held a name) does not carry a stale id from a previous choice.
 */
export function setAccountDefaultTeam(
    authFile: AuthFile,
    accountId: string,
    team: { id: string | null; name: string },
): AuthFile {
    return mapAuthAccount(authFile, accountId, account => ({
        ...withoutTeamFields(account),
        ...optionalTeamFields(team.name, team.id ?? undefined),
    }));
}

/** Removes the default team identity from one account. */
export function clearAccountDefaultTeam(
    authFile: AuthFile,
    accountId: string,
): AuthFile {
    return mapAuthAccount(authFile, accountId, (account) => {
        if (account.team === undefined && account.teamId === undefined) {
            return account;
        }

        return withoutTeamFields(account);
    });
}

export function removeCurrentAuthAccount(authFile: AuthFile): AuthFile {
    return {
        auth: authFile.auth.filter(account => account.id !== authFile.id),
        id: "",
    };
}

export function setCurrentAuthId(
    authFile: AuthFile,
    id: string,
): AuthFile {
    return {
        ...authFile,
        id,
    };
}

export function getNextAuthAccount(
    authFile: AuthFile,
): AuthAccount | undefined {
    if (authFile.auth.length === 0) {
        return undefined;
    }

    const currentIndex = authFile.auth.findIndex(
        account => account.id === authFile.id,
    );
    const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + 1) % authFile.auth.length;

    return authFile.auth[nextIndex];
}

export function getCurrentAuthAccount(
    authFile: AuthFile,
): AuthAccount | undefined {
    if (authFile.id === "") {
        return undefined;
    }

    return authFile.auth.find(account => account.id === authFile.id);
}

function renderTomlLine(key: string, value: string): string {
    return stringifyToml({ [key]: value }).trimEnd();
}

// Replaces one account in place, returning the original file when the account
// is unknown or the mapping changed nothing, so callers can skip a write.
function mapAuthAccount(
    authFile: AuthFile,
    accountId: string,
    map: (account: AuthAccount) => AuthAccount,
): AuthFile {
    const index = authFile.auth.findIndex(account => account.id === accountId);

    if (index === -1) {
        return authFile;
    }

    const account = authFile.auth[index]!;
    const nextAccount = map(account);

    if (nextAccount === account) {
        return authFile;
    }

    return {
        ...authFile,
        auth: authFile.auth.map((currentAccount, currentIndex) =>
            currentIndex === index ? nextAccount : currentAccount,
        ),
    };
}

// Everything about an account except its default team. Written as a removal
// rather than a list of the fields to keep, so a field added to the account
// later survives a team write instead of being silently dropped by it.
function withoutTeamFields(account: AuthAccount): AuthAccount {
    const { team: _team, teamId: _teamId, ...rest } = account;

    return rest;
}

// One trim-and-drop rule for both team fields, so a blank value on disk, a
// blank value from a caller, and an absent value all mean the same thing.
function optionalTeamFields(
    team: string | undefined,
    teamId: string | undefined,
): { team?: string; teamId?: string } {
    const trimmedTeam = team?.trim();
    const trimmedTeamId = teamId?.trim();

    return {
        ...(trimmedTeam === undefined || trimmedTeam === ""
            ? {}
            : { team: trimmedTeam }),
        ...(trimmedTeamId === undefined || trimmedTeamId === ""
            ? {}
            : { teamId: trimmedTeamId }),
    };
}
