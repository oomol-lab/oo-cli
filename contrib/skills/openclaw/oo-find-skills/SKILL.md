---
name: oo-find-skills
disable-model-invocation: true
description: Search the published OOMOL skill catalog, compare candidate skills, and install chosen results using the oo CLI. Do not use for generic skill discovery outside the oo or OOMOL ecosystem.
---

# oo Find Skills

Use this skill when the user wants to discover and install existing published
skills from the OOMOL or `oo` skill catalog through `oo skills search` and
`oo skills install`.

Read [references/oo-cli-contract.md](references/oo-cli-contract.md) when you
need exact `oo skills search` or `oo skills install` command forms, JSON
expectations, output-shape rules, or failure-handling details.

## Workflow

### 1. Normalize the request into English search terms

Convert the user request into:

- one short internal intent statement
- one concise English sentence for the search text
- `0` to `3` English keywords or short phrases for the optional `--keywords`
  filter

Rules:

- The sentence and keywords must always be in English, regardless of the
  user's language.
- The sentence should describe only the user's need itself.
- Prefer a short sentence built from task + capability + domain or constraint.
- Do not add meta words such as `skill`, `skills`, `search`, `install`, or
  `Codex` unless the user's actual need depends on those words.
- Avoid filler words.
- Use keywords only when they add extra filtering signal that the sentence does
  not already capture.
- Prefer `0` to `3` keywords. Do not exceed `3`.

Examples:

- Sentence: `translate scanned images from Japanese to English`
  Keywords: `Japanese`, `image translation`
- Sentence: `generate a QR code from text`
  Keywords: `QR code`
- Sentence: `convert speech to text`
  Keywords: `transcription`
- Sentence: `write Markdown more effectively`
  Keywords: `Markdown`, `writing`

Use the sentence as the main search text. Add `--keywords` only when the extra
keywords help narrow the search.

### 2. Search for candidate skills

Run:

```bash
oo skills search "<english query>" --json
```

Or, when helpful:

```bash
oo skills search "<english sentence>" --keywords "<comma-separated keywords>" --json
```

Then:

- Rank only from the returned JSON array.
- Prefer semantic matches between the original user goal and the returned
  `description`, `skillDisplayName`, or `name`.
- Keep one primary skill.
- Keep one fallback skill only if it is genuinely plausible.

If the returned array is empty, tell the user there is no matching skill
available right now and stop. Do not present a menu.

### 3. Filter installable results

- Treat a search item as installable only when it includes both `packageName`
  and `name`.
- If the JSON array is non-empty but no installable items exist, stop and tell
  the user that no installable skill could be derived from the search results.
  Do not present a menu.

### 4. Rank the installable results

- Rank the installable JSON items using only the fields in the response.
- Pick one primary skill and, only if credible, one fallback skill.

### 5. Ask the user to choose

- Only when at least one installable result exists, ask the user to choose
  between the available actions.
  Do not stop at a plain existence summary when installable results exist.
  Even if the user first asks whether a matching skill exists, this skill
  should still continue into the chooser step after confirming the matches.

Interaction rules:

- If a credible fallback exists, offer these actions:
  1. Install the primary skill as `primarySkillName (primaryPackageName)`
  2. Install the fallback skill as `fallbackSkillName (fallbackPackageName)`
  3. Install both
  4. Install neither
- If no credible fallback exists, offer only these actions:
  1. Install the primary skill as `primarySkillName (primaryPackageName)`
  2. Install neither
- Prefer asking the user with a short multiple-choice prompt in chat.
- If the host provides a short-question UI, you may use it. Otherwise ask in
  plain text.
- If the UI returns `None of the above`, treat that as the same outcome as
  `Install neither`.
- In either UI or text form, the label for every install action must include
  the concrete `skillName (packageName)` text.

Fallback text format:

```text
1. Install <skillName> (<packageName>)
2. Install <skillName2> (<packageName2>)
3. Install both
4. Install neither

Reply with: 1, 2, 3, or 4
```

If no credible fallback exists, use:

```text
1. Install <skillName> (<packageName>)
2. Install neither

Reply with: 1 or 2
```

If the user reply is not one of the explicit numbers that correspond to the
currently available options, do not install anything. Ask the user to reply
with one of the displayed numbers.

### 6. Install after confirmation

9. After the user chooses, install only the selected skill or skills with
   `oo skills install`.
   If the user chooses `Install neither` or the UI returns `None of the above`,
   do not install anything. Reply with exactly one short acknowledgement in the
   user's language that no skill was installed, then stop. Do not continue with
   extra result explanation, matched-result recap, ranking recap, package names,
   skill names, descriptions, or repeated summaries.
10. Batch by package:
   - If both selected skills come from the same package, install them with one
     command and multiple `-s` flags.
   - If they come from different packages, run one install command per package.
   If `Install both` requires multiple `oo skills install` commands across
   different packages and a later command fails after an earlier one succeeded,
   report the partial completion accurately: say which package or skill
   installation succeeded, say which command failed, say that no rollback was
   attempted, and then stop.

Install examples:

- Single skill install:

```bash
oo skills install "<packageName>" -s "<skillName>" -y
```

- Two skills from the same package:

```bash
oo skills install "<packageName>" -s "<skillName1>" -s "<skillName2>" -y
```

- Two skills from different packages:

```bash
oo skills install "<packageName1>" -s "<skillName1>" -y
oo skills install "<packageName2>" -s "<skillName2>" -y
```

11. Use each search result's `name` field as the `-s` value. Use
    `skillDisplayName` only for display text.
12. Never invent package names, skill names, versions, or extra metadata.
13. If `oo skills search` or `oo skills install` fails for any reason other
    than the explicit HTTP `402` billing case, stop immediately and report the
    exact command failure. Do not invent recommendations, do not claim an
    install succeeded, and do not continue silently.
14. If the command output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`,
    stop immediately, tell the user their current account has insufficient
    credit or is overdue, and direct them to
    `https://console.oomol.com/billing/recharge` before retrying.

## Behavior Notes

- `oo skills search --json` returns at most `5` results because that is the CLI
  behavior for this command. Do not try to enforce or emulate a different
  limit in the skill text.
- Use `skillDisplayName` when present, otherwise fall back to `name`.
- Prefer the closest semantic match for the primary skill.
- Break ranking ties deterministically by preferring the result whose
  `description` or display text more directly matches the same user request.
- Prefer non-duplicate results over near-duplicates.
- If the semantic match is still tied, prefer the result with clearer install
  identifiers (`packageName` plus `name`) and richer explanatory text.
- You may compare response text fields against the original user request, but
  you must not use external metadata or guessed fields to break ties.
- Treat a fallback as credible only when it is the next-best result that still
  plausibly solves the same user request, not merely a loosely related or
  duplicate-looking match.
- Do not install anything before the user explicitly chooses one of the four
  options.
