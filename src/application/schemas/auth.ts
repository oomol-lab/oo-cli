import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

export const authAccountSchema = z.object({
    apiKey: z.string().min(1),
    endpoint: z.string().min(1),
    id: z.string().min(1),
    name: z.string().min(1),
}).strict();

export const authFileSchema = z.object({
    auth: z.array(authAccountSchema),
    id: z.string(),
}).strict();

const authAccountTomlSchema = z.union([
    z.object({
        api_key: z.string().min(1),
        endpoint: z.string().min(1),
        id: z.string().min(1),
        name: z.string().min(1),
    }).strict(),
    z.object({
        // Support legacy auth.toml files that used uppercase account ids.
        ID: z.string().min(1),
        api_key: z.string().min(1),
        endpoint: z.string().min(1),
        name: z.string().min(1),
    }).strict(),
]).transform(account => ({
    apiKey: account.api_key,
    endpoint: account.endpoint,
    id: "id" in account ? account.id : account.ID,
    name: account.name,
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
    }

    return `${lines.join("\n")}\n`;
}

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

    return {
        auth: authFile.auth.map((currentAccount, index) =>
            index === existingIndex ? account : currentAccount,
        ),
        id: account.id,
    };
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
