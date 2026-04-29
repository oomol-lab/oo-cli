# oo CLI Contract for Skill Discovery

Use this reference when you need the concrete `oo` command forms for finding
and installing skills.

## `oo skills search`

Canonical form:

```bash
oo skills search "<text>" --json
```

Optional keyword-refined form:

```bash
oo skills search "<text>" --keywords "<comma-separated keywords>" --json
```

Facts:

- `--json` is an alias for `--format=json`.
- `--keywords` is optional and accepts a comma-separated list.
- The command returns a raw JSON array.
- Search results may include `description`, `name`, `packageName`,
  `packageVersion`, and `skillDisplayName`.
- The CLI returns at most `5` results for this command.
- Treat an empty array as no matching capability.
- An item is installable only when it includes both `packageName` and `name`.
- If the JSON array is non-empty but no items are installable, stop and explain
  that no installable skill could be derived from the search results.

## `oo skills install`

Canonical forms:

```bash
oo skills install <packageName> -s "<skillName>" -y
```

```bash
oo skills install <packageName> -s "<skillName1>" -s "<skillName2>" -y
```

Facts:

- Bundled skill names can be installed directly by package name.
- When both chosen skills come from the same package, install them with one
  command and multiple `-s` flags.
- When the chosen skills come from different packages, run one install command
  per package.
- If `Install both` requires multiple `oo skills install` commands across
  different packages and a later command fails after an earlier one succeeded,
  report the partial completion accurately: say which package/skill
  installation(s) succeeded, say which command failed, say that no rollback was
  attempted, and then stop.
- Use only the package and `name` fields returned by `oo skills search --json`.
- Use `skillDisplayName` only for user-facing labels, never as a `-s` value.
- If the `AskUserQuestion` UI returns `None of the above`, treat that as
  the same outcome as `Install neither`.
- If the user reply is not one of the explicit numbers that correspond to the
  currently displayed options, do not install anything. Ask the user to reply
  with one of the displayed numbers.
- Every install option label must include the concrete
  `skillName (packageName)` text.

Output shape:

- When a credible fallback exists, show four numbered choices:
  `Install <primarySkillName> (<primaryPackageName>)`,
  `Install <fallbackSkillName> (<fallbackPackageName>)`,
  `Install both`, `Install neither`.
- Do not stop at a plain existence confirmation when installable results exist.
  Even if the user's first question is only whether a matching skill exists,
  continue into the chooser step after confirming the matches.
- When no credible fallback exists, show only two numbered choices:

```text
1. Install <skillName> (<packageName>)
2. Install neither
```

Ranking guidance:

- Prefer the installable result whose `description` or display text more
  directly matches the same user request.
- Prefer non-duplicate results over near-duplicates.
- If the semantic match is tied, prefer the result with clearer install
  identifiers (`packageName` plus `name`) and richer explanatory text.
- You may compare response text fields against the original user request, but
  you must not use external metadata or guessed fields to break ties.

Failure handling:

- If `oo skills search` or `oo skills install` fails for any reason other than
  the explicit HTTP `402` billing case, stop immediately and report the exact
  command failure. Do not invent recommendations, do not claim an install
  succeeded, and do not continue silently.
- If the user chooses `Install neither` or the UI returns `None of the above`,
  do not install anything. Reply with exactly one short acknowledgement in the
  user's language that no skill was installed, then stop without extra result
  recap, package names, skill names, or descriptions.
- If any `oo` output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop
  immediately, tell the user their current account has insufficient credit or
  is overdue, and direct them to
  `https://console.oomol.com/billing/recharge` before retrying.
