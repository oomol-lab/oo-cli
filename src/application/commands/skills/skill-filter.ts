import { basename } from "node:path";

// A skill that can be narrowed by the `--skill` option. Matching is
// case-insensitive against the skill name and, when a directory path is known,
// the path basename (the on-disk display name). For registry package skills the
// name already equals the installed directory basename, so the optional path is
// only carried for installed skills where the two could in principle differ.
export interface SkillFilterCandidate {
    name: string;
    path?: string;
}

// Normalize the raw `--skill` values into a lowercase lookup set. Tokens are
// trimmed, lowercased, and de-duplicated. Returns undefined when no usable
// token remains, which callers treat as "no filter" (operate on every
// candidate).
export function normalizeSkillFilterTokens(
    tokens: readonly string[] | undefined,
): Set<string> | undefined {
    if (tokens === undefined) {
        return undefined;
    }

    const normalized = new Set<string>();

    for (const token of tokens) {
        const trimmed = token.trim().toLowerCase();

        if (trimmed !== "") {
            normalized.add(trimmed);
        }
    }

    return normalized.size === 0 ? undefined : normalized;
}

// Whether a candidate matches at least one requested token, comparing the
// skill name and the path basename case-insensitively.
export function skillMatchesFilterTokens(
    candidate: SkillFilterCandidate,
    tokens: ReadonlySet<string>,
): boolean {
    if (tokens.has(candidate.name.toLowerCase())) {
        return true;
    }

    if (candidate.path !== undefined) {
        return tokens.has(basename(candidate.path).toLowerCase());
    }

    return false;
}

// Keep only the candidates that match at least one requested token. Tokens that
// match no candidate are silently ignored; deciding what to do when nothing
// matches is left to the caller (each command lists the available skills).
export function selectSkillsByFilter<T extends SkillFilterCandidate>(
    candidates: readonly T[],
    tokens: ReadonlySet<string>,
): T[] {
    return candidates.filter(candidate => skillMatchesFilterTokens(candidate, tokens));
}

// Narrow a package's published skills by the `--skill` filter. Returns every
// skill when no filter is active. When the filter matches nothing, selects
// nothing and reports the package's published skill names through
// `reportMiss`; the caller decides whether an empty result is an error.
export function selectFilteredSkills<T extends SkillFilterCandidate>(
    skills: readonly T[],
    skillFilter: readonly string[] | undefined,
    reportMiss: ((availableSkillNames: readonly string[]) => void) | undefined,
): readonly T[] {
    const tokens = normalizeSkillFilterTokens(skillFilter);

    if (tokens === undefined) {
        return skills;
    }

    const selected = selectSkillsByFilter(skills, tokens);

    if (selected.length === 0) {
        reportMiss?.(skills.map(skill => skill.name));

        return [];
    }

    return selected;
}
