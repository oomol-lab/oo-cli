import { dirname, join } from "node:path";
import { Glob } from "bun";
import { describe, expect, test } from "bun:test";

import { enMessages, zhMessages } from "./catalog.ts";

/**
 * Keys the scanner cannot attribute to a consumer but that are still live.
 * Prefer fixing the call site over adding entries here: a key that reaches
 * this list is one the next reader cannot trace either.
 */
const intentionallyUnreferencedKeys = new Set<string>();

describe("message catalog", () => {
    test("uses shared keys for consolidated labels and errors", () => {
        expect(enMessages["auth.account.loggedIn"]).toBe(
            "Logged in to {endpoint} account {name}",
        );
        expect(enMessages["auth.account.activeAccountMissing"]).toBe(
            "The active account is missing from the auth store.",
        );
        expect(enMessages["errors.shared.invalidFormat"]).toBe(
            "Invalid format: {value}. Use json.",
        );
        expect(enMessages["errors.shared.invalidPositiveIntegerOption"]).toBe(
            "Invalid value for {option}: {value}. Use an integer greater than or equal to 1.",
        );
        expect(enMessages["errors.billing.insufficientCredit"]).toBe(
            "Your OOMOL account balance is insufficient. Recharge before retrying: {url}",
        );
        expect(enMessages["errors.skills.list.invalidSource"]).toBe(
            "Invalid source: {value}. Use bundled, registry, or local.",
        );
        expect(enMessages["labels.status"]).toBe("Status");
        expect(enMessages["labels.version"]).toBe("Version");
        expect(zhMessages["auth.account.loggedIn"]).toBe(
            "已登录 {endpoint} 账号 {name}",
        );
        expect(zhMessages["auth.account.activeAccountMissing"]).toBe(
            "当前激活账号不存在于认证数据中。",
        );
        expect(zhMessages["errors.shared.invalidFormat"]).toBe(
            "无效的 format：{value}。请使用 json。",
        );
        expect(zhMessages["errors.shared.invalidPositiveIntegerOption"]).toBe(
            "{option} 的值无效：{value}。请使用大于等于 1 的整数。",
        );
        expect(zhMessages["errors.billing.insufficientCredit"]).toBe(
            "你的 OOMOL 账户余额不足。请充值后再重试：{url}",
        );
        expect(zhMessages["errors.skills.list.invalidSource"]).toBe(
            "无效的 source：{value}。请使用 bundled、registry 或 local。",
        );
        expect(zhMessages["labels.status"]).toBe("状态");
        expect(zhMessages["labels.version"]).toBe("版本");
    });

    test("both locales declare the same key set", () => {
        expect(Object.keys(zhMessages).sort()).toEqual(
            Object.keys(enMessages).sort(),
        );
    });

    test("every catalog key has a consumer", async () => {
        const sources = await readCatalogConsumerSources();
        const dynamicPrefixes = collectDynamicKeyPrefixes(sources);

        const unreferenced = Object.keys(enMessages).filter(
            key => !intentionallyUnreferencedKeys.has(key)
                && !sources.some(source => source.includes(`"${key}"`))
                && !dynamicPrefixes.some(prefix => key.startsWith(`${prefix}.`)),
        );

        expect(unreferenced).toEqual([]);
    });
});

/**
 * Reads every file that may consume a catalog key. The catalog itself is
 * excluded so a key is never treated as its own consumer.
 */
async function readCatalogConsumerSources(): Promise<string[]> {
    const repositoryRoot = dirname(dirname(import.meta.dir));
    const catalogPath = join(import.meta.dir, "catalog.ts");
    const sources: string[] = [];

    for (const directory of ["src", "contrib"]) {
        const glob = new Glob("**/*.ts");
        const scanRoot = join(repositoryRoot, directory);

        for await (const relativePath of glob.scan(scanRoot)) {
            const filePath = join(scanRoot, relativePath);

            if (filePath === catalogPath) {
                continue;
            }

            sources.push(await Bun.file(filePath).text());
        }
    }

    return sources;
}

/**
 * Recovers the key prefixes that are completed at run time, so a dynamically
 * built key is not reported as unreferenced. Two shapes produce them: template
 * literals such as `skills.info.kind.${skill.kind}`, and the `scope` of an oo
 * request, which expands to the `errors.<scope>.*` triplet.
 */
function collectDynamicKeyPrefixes(sources: readonly string[]): string[] {
    const prefixes = new Set<string>();

    for (const source of sources) {
        collectTemplateLiteralPrefixes(source, prefixes);
        collectRequestScopePrefixes(source, prefixes);
    }

    return [...prefixes];
}

/**
 * Finds `some.key.prefix.${...}` inside a template literal and keeps the
 * static part. The interpolation must be preceded by a dotted run of key
 * characters that starts right after the opening backtick.
 */
function collectTemplateLiteralPrefixes(
    source: string,
    prefixes: Set<string>,
): void {
    const interpolation = ".${";
    let index = source.indexOf(interpolation);

    while (index >= 0) {
        let start = index;

        while (start > 0 && isKeyCharacter(source[start - 1]!)) {
            start--;
        }

        const prefix = source.slice(start, index);

        if (source[start - 1] === "`" && prefix.includes(".")) {
            prefixes.add(prefix);
        }

        index = source.indexOf(interpolation, index + interpolation.length);
    }
}

/**
 * An oo request names an `errors.<scope>` namespace instead of spelling out
 * its requestFailed/requestError/invalidResponse keys.
 */
function collectRequestScopePrefixes(
    source: string,
    prefixes: Set<string>,
): void {
    const marker = "scope: \"";
    let index = source.indexOf(marker);

    while (index >= 0) {
        const start = index + marker.length;
        const end = source.indexOf("\"", start);

        if (end > start) {
            prefixes.add(`errors.${source.slice(start, end)}`);
        }

        index = source.indexOf(marker, start);
    }
}

function isKeyCharacter(character: string): boolean {
    return character === "."
        || character === "_"
        || (character >= "a" && character <= "z")
        || (character >= "A" && character <= "Z")
        || (character >= "0" && character <= "9");
}
