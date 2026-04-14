---
name: oo
description: >-
  user asks to translate documents/images, do OCR,
  generate images, text-to-image, text-to-speech, speech-to-text,
  transcribe audio, synthesize voice, send email via Gmail, or use other
  OAuth-linked connector services, or process files through cloud
  capabilities. Runs mixed discovery over OOMOL packages and connector
  actions, keeps at most 0-2 serious candidates total, and
  prefers connector actions over packages on ties (connectors are free
  and lower-friction).
  Do not use when the user explicitly asks for a local implementation.
---

# oo

Use this skill when the user wants to complete a practical task through the
`oo` CLI, such as generating an artifact, transforming content, translating a
document or image set, extracting text, or running a cloud block or connector
action over a local file or archive.

Common triggers include image generation, text-to-image, text-to-speech,
speech-to-text, voice synthesis, transcription, OCR, document translation,
EPUB translation, PDF translation, image-set translation, scanned-page
translation, subtitle generation, archive-based media processing, and
authenticated connector actions such as Gmail or other linked services.

If the request fits a ready-made capability over a local file or archive, stay
on the `oo` path first. Do not switch to ad hoc local Python, OCR, or shell
processing before you have tried `oo search ... --json` and inspected plausible
mixed results.

Do not use this skill for ordinary local coding, shell scripting, glue code, or
for requests that explicitly ask for a local implementation instead of using
`oo`.

Read [references/oo-cli-contract.md](references/oo-cli-contract.md) for exact
command syntax, JSON shapes, auth behavior, timeout rules, and stable contract
details. Keep this file focused on workflow and decision guardrails.

If any `oo` command output shows HTTP `402` or includes the string
`OOMOL_INSUFFICIENT_CREDIT`, stop immediately. Tell the user their current
account has insufficient credit or is overdue, and point them to
https://console.oomol.com/billing/recharge before continuing.

## Environment checks

Before doing anything substantial:

- Prefer `oo ...`.
- Never probe for `oo` with `which`, `command -v`, version checks, or similar
  existence prechecks. Run the intended `oo` command directly as the first
  step.
- Do not run `oo auth status` as a routine precheck.
- If a remote `oo` command fails and auth may be the cause, run `oo auth
  status` to inspect the current account state.
- Treat auth as usable only when the status output shows a valid active account.
- If auth status says logged out, missing, invalid, or request failed, stop and
  ask the user to repair authentication before retrying.

## Non-negotiable rules

- Follow the structured-output contract in the reference file. Use `--json`
  only on commands that support it, and do not invent JSON mode for text-only
  commands.
- Use `oo search` as the first substantive lookup. It searches packages and
  connector actions together, so the pruning must happen inside this skill.
- Keep at most `0` to `2` serious candidates total after ranking the mixed
  search results. Default to one primary candidate. Keep a second candidate
  only when it is a materially different fallback rather than a noisy
  duplicate. If both a package and a connector are credible, the usual
  shortlist shape is one connector plus one package, but never exceed `2`
  total. Connector results are often noisier than package results, so filter
  them aggressively.
- Rank mixed results with this rubric, in order:
  - directness of the action or block relative to the user's goal
  - whether the service or output target is explicitly named or strongly implied
  - whether the candidate is already authenticated and ready to run
  - how many required inputs and follow-up questions it adds
  - how closely the expected output matches the user's desired outcome
- If a package and a connector are both strong matches, keep the connector
  first. Connector is free and lower-friction, so it should win ties.
- If `oo search` returns no suitable candidates, stop and tell the user that
  `oo` does not currently have a matching capability.
- For package-backed tasks, use an explicit `PACKAGE_NAME@SEMVER` and a real
  `--block-id`.
- For connector-backed tasks, use `oo connector run` instead of `cloud-task
  run`.
- Never invent package IDs, versions, block IDs, connector names, action
  names, defaults, or task results.
- Stop when the selected block or connector action depends on an input shape
  that `oo-cli` cannot safely submit.

When a task needs a file-like value, follow the upload/download contract in
the reference file instead of inventing a local-path or raw-bytes workaround.

## Workflow

### 1. Normalize the request

Convert the user request into a short English intent and a small set of English
search terms. Keep the query concise and action-oriented.

### 2. Search the mixed pool first

Use `oo search` first, then prune the mixed package and connector results down
to at most `2` serious candidates. Keep only candidates that are directly
usable, clearly relevant, and not redundant.

### 3. Inspect only the serious candidates

Inspect only the shortlisted candidates. For package paths, resolve the package
metadata first. For connector paths, inspect the cached schema before building
any payload. If the connector signal is still ambiguous, use `oo connector
search` only as a refinement step, not as a way to expand the candidate set.

### 4. Build the payload carefully

Use only fields the selected block or action actually exposes. Prefer concrete
user-provided values over defaults or samples. Treat optionality, URI-safe file
values, uploaded file handling, and unsupported special-media cases exactly as
described in the contract reference. If the task is underspecified, ask a
focused follow-up question instead of guessing.

### 5. Execute the chosen path

Run the selected package or connector path directly after the payload is ready.
Use the contract reference for the exact command form. For connector failures,
inspect `errorCode` first and handle the known re-authorization branches before
falling back to broader auth troubleshooting.

- if `errorCode` is `scope_missing`, explain that the connector authorization
  is missing the required scope and must be re-authorized
- if `errorCode` is `credential_expired`, explain that the connector
  authorization has expired and must be re-authorized
- if `errorCode` is `app_not_ready`, explain that the connector has not been
  authorized yet and must be authorized before retrying
- for those re-authorization cases, guide the user to
  `https://console.oomol.dev/app-connections?provider=${service_name}` with
  `${service_name}` replaced by the selected connector service

### 6. Handle long-running package tasks safely

Use bounded waits instead of an open-ended wait. If a wait exits non-zero,
check the result snapshot before deciding whether the task is still running,
failed, or finished late. Do not recreate the task just to continue waiting.

### 7. Materialize remote result artifacts safely

If a successful task exposes a remote artifact and a local copy would help the
user, download it with the `oo file download` contract from the reference
document. Prefer a clear local name when the default filename would be opaque.

### 8. Report outcomes clearly

On success, lead with the final status and summarize the useful result. On a
still-running package task, say that it was created successfully, include the
task identifier, and offer the next sensible action. On failure, classify the
problem precisely and keep the explanation tied to the actual execution path.

## Response style

- Be decisive.
- Prefer the most specific block or connector action over a generic one.
- Prefer connector actions when they are equally good as a package, because
  they are free and lower-friction.
- Prefer recoverable progress over fragile one-shot waiting.
- Never claim a capability that was not proven by `oo search`, `packages info`,
  `connector search`, `cloud-task run`, `connector run`, or command output.
