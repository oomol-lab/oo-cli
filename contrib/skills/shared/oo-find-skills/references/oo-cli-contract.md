# oo CLI Contract for Skill Discovery

Use this reference when you need the concrete `oo` command forms for finding
and installing skills.

## `oo skills search`

Canonical form (always pass `--keywords`):

```bash
oo skills search "<text>" --keywords "<comma-separated keywords>" --json
```

Facts:

- `--json` is an alias for `--format=json`.
- `--keywords` is required for skill discovery. Always pass `1` to `3`
  comma-separated keywords and never run discovery without it.
- Keywords may use the user's original language. Keep product, brand, and
  proper names exactly as written and do not translate them (for example, keep
  `滴答清单`; do not turn it into `TickTick`). The backend tokenizes keywords,
  while the free-text query alone runs an untokenized semantic search.
- The command returns a raw JSON array.
- Search results may include `description`, `name`, `packageName`,
  `packageVersion`, and `skillDisplayName`.
- The CLI returns at most `5` results for this command.
- An empty array means this search found no matching result. For an expected
  private package, use the private package access guidance below.
- An item is installable only when it includes both `packageName` and `name`.
- If the JSON array is non-empty but no items are installable, stop and explain
  that no installable skill could be derived from the search results.

## `oo skills install`

Canonical forms:

```bash
oo skills install <packageName> -s "<skillName>"
```

```bash
oo skills install <packageName> -s "<skillName1>" -s "<skillName2>"
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
  attempted, and follow the failure-handling rules below.
- For discovery, use the package and `name` fields returned by search. For a
  repair, preserve the exact package and skill from the failed command; use
  authenticated Console package queries when their identity needs verification.
- Use `skillDisplayName` only for user-facing labels, never as a `-s` value.
<!-- agentic:if skillSelectionPromptTool -->
- If the `<!-- agentic:var skillSelectionPromptTool -->` UI returns `None of the above`, treat that as
  the same outcome as `Install neither`.
<!-- agentic:endif -->
- If the user reply is not one of the explicit numbers that correspond to the
  currently displayed options, do not install anything. Ask the user to reply
  with one of the displayed numbers.
- Every install option label must include the concrete
  `skillName (packageName)` text.

Output shape:

- For find, compare, recommend, or existence-check requests, report the primary
  installable skill and any credible fallback with a short reason, then ask
  whether the user wants to install one. Do not install until the user chooses.
- For explicit install requests, ask the user to choose from the applicable
  install actions before running `oo skills install`.
- When a credible fallback exists, show four numbered choices:
  `Install <primarySkillName> (<primaryPackageName>)`,
  `Install <fallbackSkillName> (<fallbackPackageName>)`,
  `Install both`, `Install neither`.
- When no credible fallback exists, show only two numbered choices:

```text
1. Install <skillName> (<packageName>)
2. Install neither
```

Ranking guidance:

- You may compare response text fields against the original user request, but
  you must not use external metadata or guessed fields to break ties.

Failure handling:

- Report the exact failure from `oo skills search` or `oo skills install`.
  With private-package or team-access clues, use the diagnosis below; otherwise
  stop. Do not invent recommendations or claim an install succeeded.
- If the user chooses `Install neither`, declines installation, or the UI returns
  `None of the above`, do not install anything. Reply with exactly one short
  acknowledgement in the user's language that no skill was installed, then stop.
- If any `oo` output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop
  immediately, tell the user their current account has insufficient credit or
  is overdue, and direct them to
  `https://console.oomol.com/billing` before retrying.
- If a command fails with a message saying the self-hosted connector only
  supports connector commands, or with JSON error code `not_authenticated` in
  self-hosted connector mode, an OOMOL account is required. Ask the user to
  run `oo auth login`, then stop.

## Private package access

Use this mode for a known private skill that cannot be found or installed,
including a bot that already belongs to the publisher's team. Team membership
alone does not grant access to an unconfigured private package. An identity
with package access and team write permission must add the package to the
team. The grant covers the whole package, keeps it private, and is separate
from Connection action permission groups and local installation.

`oo skills info` lists local skills. `oo skills search` returns at most five
matches and is not a complete list of personal publications. The
`oomol_console.list_my_skill_packages` action lists only packages maintained by
the authenticated identity, with pagination. A bot's empty list does not mean
its owner has no published packages.

Check the original install specifier before diagnosing a team-access failure.
For `<packageName>#<shareID>`, diagnose the temporary share separately, using
the failing request and response to check for an invalid or expired share or
an exhausted download limit. Preserve the share ID. Do not add the package to
the team, strip the share ID, or retry as a team repair unless the failure is
established to result from missing team configuration. A failed share download
or an absent team binding alone does not establish that cause.

Use `oo connector schema` to inspect the relevant `oomol_console` actions:
`get_current_scope`, `list_members`, `list_my_skill_packages`,
`list_team_skill_packages`, and `add_skill_package_to_team`. Call them through
`oo connector run "oomol_console" --action "<action>" --data '<json>' --json`.
For `add_skill_package_to_team`, append `--approval` when existing authorization
covers the exact package and team access change. If it returns
`approval_required`, retry the same mutation with `--approval` only when that
authorization is sufficient, preserving the team and input. The error itself
does not supply authorization. Do not add the flag to read actions.
Select the intended team with `oo --team "<team-name>" connector run ...`, or
use a verified team ID through `OO_TEAM_ID="<team-id>" oo connector run ...`.
Keep this team selection for the diagnosis, change, and readback. These are
per-command overrides and do not require changing the saved default team.

Establish the exact package name, failing account or service-account identity,
target team, active membership, and whether the team has that package. Do not
substitute the publisher's identity for the bot's. A 403 or 404 alone cannot
distinguish missing authorization, a wrong package name, or another failure.
If the package is already configured, investigate the failing identity and
membership rather than adding it again or changing Connection permissions.

When missing team configuration is established as the cause, the user asked to
fix the installation, and the package and team are clear, use existing
authorization to add the missing package when the caller has the necessary
access. Do not require another confirmation solely because this is a repair.
If the user only asked why installation failed, report the cause
without changing access. Ask only for unresolved package, team, or authorization
choices that affect the change.

After adding, query the team packages again. Retry the original installation
once with the original failing identity when available; if it still fails,
report that failure and the verified configuration. When that identity is not
available, report that only team configuration was verified, not installation.
Do not retry completed packages from a partially successful multi-package install.

When the caller lacks access, report the specific restriction established by
the response and direct an authorized user to select the target team and add
the package at https://console.oomol.com/skills. If the response is ambiguous,
state what remains unverified. Do not make the package public, create a temporary
share, or switch accounts to bypass the restriction. Billing and self-hosted
account blockers above still stop the workflow immediately.
