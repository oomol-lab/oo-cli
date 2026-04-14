---
name: oo
disable-model-invocation: true
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
allowed-tools: ["Bash(oo *)"]
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

Read [references/oo-cli-contract.md](references/oo-cli-contract.md) when you
need exact command syntax, JSON shapes, auth behavior, timeout rules, or known
stop conditions.

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
- If a remote `oo` command fails and auth may be the cause, run
  `oo auth status` to inspect the current account state.
- Treat auth as usable only when the status output shows a valid active
  account.
- If auth status says logged out, missing, invalid, or request failed, stop and
  ask the user to repair authentication before retrying.

## Non-negotiable rules

- Always use `--json` with:
    - `search`
    - `packages search`
    - `packages info`
    - `connector search`
    - `connector run`
    - `cloud-task run`
    - `file upload`
- Never add `--json` to `cloud-task wait`.
- Never add `--json` to `oo file download`. It does not support structured
  output, so read the saved path from the human-readable success line.
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
    - whether the service or output target is explicitly named or strongly
      implied
    - whether the candidate is already authenticated and ready to run
    - how many required inputs and follow-up questions it adds
    - how closely the expected output matches the user's desired outcome
- If a package and a connector are both strong matches, keep the connector
  first. Connector is free and lower-friction, so it should win ties.
- Do not demote a connector purely because it is currently unauthenticated if
  linking that service is the only missing step and the connector is otherwise
  the best fit for the user's goal.
- If the request clearly fits this skill, the mere availability of local tools
  such as `python`, `unzip`, `ffmpeg`, `sips`, or OCR binaries is not a reason
  to leave the skill. Local tools may inspect inputs, but the first
  substantive capability lookup must still happen through `oo`.
- Never invent package IDs, versions, block IDs, handle names, connector
  names, action names, defaults, or task results.
- If a remote command fails with an auth-related error or unclear account
  state, inspect with `oo auth status` before retrying.
- If any command output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop
  immediately. Treat it as a billing problem, not an auth problem, and tell the
  user to recharge at https://console.oomol.com/billing/recharge before any
  retry.
- `cloud-task run` must use `PACKAGE_NAME@SEMVER`.
- `cloud-task run` must include a real `--block-id`.
- For connector-backed tasks, use `oo connector run` instead of `cloud-task
  run`.
- If `oo search` returns no suitable candidates, stop and tell the user that
  `oo` does not currently have a matching capability.
- Ask follow-up questions only when required inputs are missing or too risky
  to infer.
- Stop when the selected block or connector action depends on an input shape
  that `oo-cli` cannot safely submit.
- Never pass raw file bytes, multipart payloads, or a local filesystem path to
  `cloud-task run --data` or `connector run --data`.
- When a handle expects a URI-compatible file value, upload the local file
  first and submit the returned `downloadUrl`.
- If a final task result exposes a remote artifact URL and you want a local
  copy, prefer `oo file download <url> [outDir]` over `curl` or ad hoc download
  code.
- When downloading a user-facing artifact with `oo file download`, pass
  `--name "<descriptive base name>"` unless the response metadata already
  proves a clear human-readable filename. Preserve the inferred extension
  unless the user explicitly needs a different one.
- Omit `[outDir]` unless the user asked for a specific destination. When it is
  omitted, `oo file download` uses `file.download.out_dir` or `~/Downloads`,
  creates missing directories, avoids overwrite by renaming, and prints the
  absolute saved path.
- Remote artifact downloads should follow `oo file download` policy rather
  than the old workspace-only convention.

## Workflow

### 1. Normalize the request into English search terms

Convert the user request into:

- one short internal intent statement
- `2` to `6` English keywords or short phrases

Rules:

- Keywords must always be in English, regardless of the user's language.
- Prefer action + object + constraint.
- Avoid filler words.

Examples:

- `generate qr code`
- `md5 hash`
- `image ocr`
- `summarize pdf`
- `translate image archive`
- `translate scanned japanese pages`
- `send gmail message`

Combine the keywords into one concise English search query.

### 2. Search the mixed pool first

Run:

```bash
oo search "<english query>" --json
```

If helpful, add `--keywords` to refine connector matches without changing the
overall intent query.

Then:

- Read packages and connector actions together from the returned JSON array.
- Treat the array as the raw discovery pool; do not expose more than `2`
  serious candidates total.
- Prefer the strongest connector candidate when a connector and a package both
  fit the request well.
- Use package results when they are clearly the better execution path or when
  a connector remains too ambiguous after refinement.
- Do not demote a connector only because it is currently unauthenticated if
  linking that service is the only missing step and the connector is otherwise
  the best fit for the user's goal.

If the returned array is empty or contains no suitable candidates, stop and
tell the user that `oo` does not currently have a matching capability.

### 3. Inspect only the serious candidates

For package candidates, inspect them with one of these forms:

```bash
oo packages info "<packageName>@<version>" --json
```

```bash
oo packages info "<packageName>" --json
```

If `oo search` did not include a usable version, inspect the package by name
first and use the resolved `packageVersion` for any later `cloud-task run`.

Then choose the best block using only returned metadata. Prefer a block that:

- directly matches the requested action
- requires fewer mandatory inputs
- has clearer input semantics
- produces output closer to the user's goal

Use `blocks[].blockName` as the block identifier for execution. Do not use the
human-facing block title as `--block-id`.

For connector candidates, use the result's `service` and `name` fields as the
execution handle. Read the cached schema JSON at `schemaPath` before building
any connector payload, and use that file's exact `service`, `name`,
`description`, `inputSchema`, and `outputSchema` to confirm the action fit and
required fields. If you need a more focused connector lookup, use:

```bash
oo connector search "<english query>" --json
```

Use that only to refine a connector decision, not to widen the candidate set.

If the primary candidate fails inspection and the fallback is still credible,
switch to the fallback.

### 4. Build the input payload

Use only fields that the selected package block or connector action input
schema actually exposes.

Rules:

- JSON keys in `--data` must exactly match input handle names.
- For package-backed runs, treat a handle as optional only when the metadata
  proves it:
    - a non-null `value` already exists
    - `nullable` is `true` and `value` is `null`
    - `schema.default` exists
- For connector-backed runs, inspect the cached `inputSchema` from
  `schemaPath` and follow normal JSON Schema required-field semantics instead
  of package handle rules.
- If the user request implies a concrete value for a handle, provide it
  explicitly instead of inheriting a package default or sample value.
- Treat package-provided `value` and `schema.default` as evidence that
  omission may pass local validation, not as evidence that the value is
  correct for the current task.
- If a handle is technically optional but the task would be underspecified
  without a user-specific value, ask a follow-up question.
- Do not submit fields outside the selected block or action input.
- Do not guess secrets, credentials, local file paths, filenames, opaque IDs,
  or connector scopes.
- Do not force raw user prose into a handle whose schema does not fit.

For file-like inputs, distinguish between URI-safe values and unsupported
special-media values:

- If the schema or patched widget semantics clearly expect a URI string, ask
  the user for a local file path when needed, then upload it first:

```bash
oo file upload "<filePath>" --json
```

- Read `downloadUrl` from the JSON response and place that URL into the
  matching handle value for `cloud-task run --data` or `connector run --data`.
- Treat file widgets as URI-oriented inputs, because current CLI validation
  patches them to string values with `format: "uri"`.
- If the schema already declares a URI-shaped string, you may use an existing
  user-provided remote URL instead of uploading a local file.
- Do not upload a file unless the selected handle can safely accept a URI
  string.

If a required value is missing or ambiguous, ask a focused follow-up question.

A good follow-up question:

- identifies the missing handle
- offers `2` to `4` concrete options when possible
- includes one recommended option with a brief reason

### 5. Stop on unsupported input shapes

Stop instead of forcing execution when any of the following is true:

- a required input is still missing
- the input schema implies a value shape that cannot be safely represented
  with `cloud-task run --data` or `connector run --data`
- the block or action depends on environment data that cannot be safely
  constructed
- both primary and fallback candidates fail

Pay special attention to `schema.contentMediaType`.

If `contentMediaType` exists and is not `oomol/secret`, stop. The current
`oo-cli` local validation rejects non-secret content media types, so do not
pretend file, image, or other special payloads can be passed safely as normal
JSON values.

Do not confuse the URI-safe path with the unsupported path:

- A handle that can be validated as a URI string may be satisfied by
  `oo file upload ... --json` plus the returned `downloadUrl`.
- A handle that still exposes a non-secret `contentMediaType` is not safely
  supported through `cloud-task run --data` or `connector run --data`, even
  if the user wants to provide a local file.

### 6. Execute the chosen path

For package-backed candidates, run the task directly:

```bash
oo cloud-task run "<packageName>@<version>" \
  --block-id "<blockId>" \
  --data '<json object>' \
  --json
```

`cloud-task run` already performs local input validation before task
creation, so do not add a separate validation-only step unless the user
explicitly asks for it.

Read `taskID` from the JSON response.

For connector-backed candidates, run the action directly:

```bash
oo connector run "<serviceName>" \
  --action "<actionName>" \
  --data '<json object>' \
  --json
```

Use `--dry-run` first when you want validation without execution.

Read `meta.executionId` and `data` from the JSON response. Note that the
execution id is nested under `meta.executionId`, not at the top level.

If `connector run` fails with an HTTP error, check the `errorCode` field:

- `scope_missing`: the user's authorization is missing required scopes for
  this action. Ask the user to re-authorize the service at
  `https://console.oomol.dev/app-connections?provider=<serviceName>`.
- `credential_expired`: the user's authorization has expired. Ask the user
  to re-authorize the service at
  `https://console.oomol.dev/app-connections?provider=<serviceName>`.
- `app_not_ready`: the user has not yet authorized this service. Ask the
  user to authorize it at
  `https://console.oomol.dev/app-connections?provider=<serviceName>`.

Replace `<serviceName>` with the actual service name used in the
`connector run` command. Only fall back to broader auth troubleshooting
when the HTTP error does not expose one of these known error codes.

Immediately report:

- selected package ID and version, block ID, and task ID for package-backed
  runs
- selected service, action name, and `meta.executionId` for connector-backed
  runs
- submitted key inputs
- fallback candidate, if one exists

Do not hide the task ID or execution ID behind a long wait.

### 7. Handle long-running package tasks safely

Long-running wait handling applies only to package-backed `cloud-task run`
tasks, not to `connector run` executions.

Do not default to an open-ended wait.

Use bounded waiting windows:

- short tasks: `2m` to `10m`
- medium tasks: `15m` to `30m`
- long or unknown tasks: `30m` to `60m`

Use:

```bash
oo cloud-task wait "<taskId>" --timeout "<window>"
```

Rules:

- Wait immediately only if the task looks short or the user explicitly wants
  to wait now.
- Do not default to `6h` or longer in one call unless the user explicitly
  asks.
- Remember that a single `wait` call cannot exceed `24h`.
- If `wait` times out, treat that as "still running", not as failure.
- After any non-zero `wait` exit, immediately check:

```bash
oo cloud-task result "<taskId>" --json
```

Use the result snapshot to distinguish:

- still running
- failed
- succeeded after the wait command exited

If the wait output or result snapshot shows HTTP `402` or
`OOMOL_INSUFFICIENT_CREDIT`, stop immediately and direct the user to
https://console.oomol.com/billing/recharge before any retry.

If the user wants to continue, run another bounded wait window instead of
re-creating the task.

### 8. Materialize remote result artifacts safely

If the final package task result exposes a remote artifact URL and pulling it
back to local would clearly help the user, prefer `oo file download <url>`
after the task has succeeded.

Rules:

- Use `[outDir]` only when the user asked for a specific destination.
- Never add `--json` to `oo file download`. Successful output is a localized
  human-readable line on stdout, not a JSON object.
- When `[outDir]` is omitted, `oo file download` uses the configured
  `file.download.out_dir` value if present, otherwise `~/Downloads`.
- If the inferred saved filename would be opaque to the user, such as a UUID,
  hash, task ID, or generic `download`, choose a concise descriptive base
  name and pass it with `--name`. Omit `--name` only when the server metadata
  already yields a clear name the user can recognize.
- Let `oo file download` create missing directories, avoid overwrite by
  renaming, and print the absolute saved path.
- Do not reimplement the download with `curl`, ad hoc scripts, or manual file
  writes when `oo file download` can handle the URL.
- When reporting success, include the absolute saved path printed by
  `oo file download`.

### 9. Report outcomes clearly

On success:

- state the final status first
- summarize the useful result
- include package, version, block ID, and task ID for package-backed runs
- include service, action, and `meta.executionId` for connector-backed runs
- if you downloaded a remote artifact, include the absolute saved path

On still-running package tasks:

- state that the task was created successfully
- state that it is still running
- include the task ID
- offer the next sensible action: wait again or check a result snapshot

On failure:

- report whether the failure came from no match, missing input, unsupported
  input shape, task failure, connector validation failure, or environment or
  auth limitations

If the failure output includes HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`,
classify it as insufficient credit or overdue billing and direct the user to
https://console.oomol.com/billing/recharge before retrying anything.

## Quick reference checklist

1. Convert the user request into `2` to `6` English keywords.
2. Run `oo search "<query>" --json` as the first lookup.
3. Keep at most `0` to `2` serious candidates total across packages and
   connectors. The usual two-item shortlist is one connector plus one
   package; if both are equally strong, keep the connector first.
4. Inspect package candidates with `oo packages info --json`.
5. For connector candidates, read the cached schema file at `schemaPath`,
   optionally refine with `oo connector search --json`.
6. Ask focused follow-up questions only for missing required inputs.
7. Upload local files with `oo file upload --json` when a selected handle
   needs a URI.
8. Run `oo cloud-task run --json` for package-backed candidates or
   `oo connector run --json` (optionally with `--dry-run`) for
   connector-backed candidates.
9. Share `taskID` or `meta.executionId` immediately.
10. Use bounded `oo cloud-task wait` windows only for package-backed tasks.
11. After a non-zero wait exit, run `oo cloud-task result --json` and stop on
    billing signals such as HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`.
12. If a successful package task yields a remote artifact URL, materialize it
    with `oo file download`, adding `--name` when the inferred saved file
    name would be opaque.

## Response style

- Be decisive.
- Prefer the most specific block or connector action over a generic one.
- Prefer connector actions when they are equally good as a package, because
  they are free and lower-friction.
- Prefer recoverable progress over fragile one-shot waiting.
- Never claim a capability that was not proven by `oo search`, `packages
  info`, `connector search`, `cloud-task run`, `connector run`, or command
  output.
