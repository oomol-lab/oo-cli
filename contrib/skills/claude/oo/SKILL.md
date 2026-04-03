---
name: oo
description: >-
  TRIGGER when: user asks to translate documents/images/comics/manga,
  do OCR, generate images, text-to-image, text-to-speech, speech-to-text,
  transcribe audio, synthesize voice, or process files through cloud
  capabilities.
  Runs cloud tasks via OOMOL packages using the oo CLI.
  Do not use when the user explicitly asks for a local implementation.
allowed-tools: ["Bash(oo *)"]
---

# oo

Use this skill when the user wants to complete a practical task through the
`oo` CLI, such as generating an artifact, transforming content, translating a
document or image set, extracting text, or running a cloud block over a local
file or archive.

Common triggers include image generation, text-to-image, text-to-speech,
speech-to-text, voice synthesis, transcription, OCR, document translation,
EPUB translation, PDF translation, manga or comic translation, image-set
translation, scanned-page translation, subtitle generation, and archive-based
media processing.

If the request is to use a ready-made capability over a local file or archive,
stay on the `oo` path first. Do not switch to ad hoc local Python, OCR, or
shell processing before you have at least tried `oo packages search ... --json` and
inspected plausible packages with `oo packages info ... --json`.

Do not use this skill for ordinary local coding, shell scripting, glue code,
or for requests that explicitly ask for a local implementation instead of
using `oo`.

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
- Do not probe for `oo` with `which`, `command -v`, or similar prechecks. Run
  the intended `oo` command directly.
- Do not run `oo auth status` as a routine precheck.
- If a remote `oo` command fails and auth may be the cause, run
  `oo auth status` to inspect the current account state.
- Treat auth as usable only when the status output shows a valid active
  account.
- If auth status says logged out, missing, invalid, or request failed, stop and
  ask the user to repair authentication before retrying.

## Non-negotiable rules

- Always use `--json` with:
    - `packages search`
    - `packages info`
    - `cloud-task run`
    - `file upload`
- Never add `--json` to `cloud-task wait`.
- Never add `--json` to `oo file download`. It does not support structured
  output, so read the saved path from the human-readable success line.
- If the request clearly fits this skill, the mere availability of local tools
  such as `python`, `unzip`, `ffmpeg`, `sips`, or OCR binaries is not a reason
  to leave the skill. Local tools may inspect inputs, but the first
  substantive capability lookup must still happen through `oo`.
- Never invent package IDs, versions, block IDs, handle names, defaults, or
  task results.
- If a remote command fails with an auth-related error or unclear account
  state, inspect with `oo auth status` before retrying.
- If any command output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop
  immediately. Treat it as a billing problem, not an auth problem, and tell the
  user to recharge at https://console.oomol.com/billing/recharge before any
  retry.
- `cloud-task run` must use `PACKAGE_NAME@SEMVER`.
- `cloud-task run` must include a real `--block-id`.
- If `packages search` returns zero packages, stop and tell the user that `oo` does not
  currently have a matching capability.
- Ask follow-up questions only when required inputs are missing or too risky to
  infer.
- Stop when the selected block depends on an input shape that `oo-cli` cannot
  safely submit.
- Never pass raw file bytes, multipart payloads, or a local filesystem path to
  `cloud-task run --data`.
- When a handle expects a URI-compatible file value, upload the local file
  first and submit the returned `downloadUrl`.
- If a final task result exposes a remote artifact URL and you want a local
  copy, prefer `oo file download <url> [outDir]` over `curl` or ad hoc download
  code.
- When downloading a user-facing artifact with `oo file download`, pass
  `--name "<descriptive base name>"` unless the response metadata already proves
  a clear human-readable filename. Preserve the inferred extension unless the
  user explicitly needs a different one.
- Omit `[outDir]` unless the user asked for a specific destination. When it is
  omitted, `oo file download` uses `file.download.out_dir` or `~/Downloads`, creates
  missing directories, avoids overwrite by renaming, and prints the absolute
  saved path.
- Remote artifact downloads should follow `oo file download` policy rather than
  the old workspace-only convention.

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
- `image OCR`
- `summarize pdf`
- `translate manga zip`
- `translate comic pages`
- `translate image archive`
- `translate scanned japanese pages`

Combine the keywords into one concise English search query.

### 2. Search for candidate packages

Run:

```bash
oo packages search "<english query>" --json
```

Then:

- Rank packages only from the returned JSON array.
- Some search items may be sparse, so rank using whatever package and block
  fields are present.
- Prefer semantic matches between the user goal and the package or block text.
- Keep one primary candidate.
- Keep one fallback candidate only if it is genuinely plausible.
- Do not use `--only-package-id` for this step because it removes useful block
  hints.

If the result is empty, stop.

### 3. Inspect package details and choose a block

For each serious candidate, inspect it with one of these forms:

```bash
oo packages info "<packageName>@<version>" --json
```

```bash
oo packages info "<packageName>" --json
```

Then choose the best block using only returned metadata.

Prefer a block that:

- directly matches the requested action
- requires fewer mandatory inputs
- has clearer input semantics
- produces output closer to the user's goal

Use `blocks[].blockName` as the block identifier for execution. Do not use the
human-facing block title as `--block-id`.

If `packages search` does not provide a version, inspect the package by name first and use
the resolved `packageVersion` for any later `cloud-task run`.

If a candidate does not expose a usable package name, do not select it.

If the primary candidate fails inspection and the fallback is still credible,
switch to the fallback.

### 4. Build the input payload

Use only fields from the selected block's `inputHandle`.

Rules:

- JSON keys in `--data` must exactly match input handle names.
- Treat a handle as optional only when the metadata proves it:
    - a non-null `value` already exists
    - `nullable` is `true` and `value` is `null`
    - `schema.default` exists
- If the user request implies a concrete value for a handle, provide it
  explicitly instead of inheriting a package default or sample value.
- Treat package-provided `value` and `schema.default` as evidence that omission
  may pass local validation, not as evidence that the value is correct for the
  current task.
- If a handle is technically optional but the task would be underspecified
  without a user-specific value, ask a follow-up question.
- Do not submit fields outside `inputHandle`.
- Do not guess secrets, credentials, local file paths, filenames, or opaque IDs.
- Do not force raw user prose into a handle whose schema does not fit.

For file-like inputs, distinguish between URI-safe values and unsupported
special-media values:

- If the schema or patched widget semantics clearly expect a URI string, ask
  the user for a local file path when needed, then upload it first:

```bash
oo file upload "<filePath>" --json
```

- Read `downloadUrl` from the JSON response and place that URL into the
  matching handle value for `cloud-task run --data`.
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
- the input schema implies a value shape that cannot be safely represented with
  `cloud-task run --data`
- the block depends on environment data that cannot be safely constructed
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
  supported through `cloud-task run --data`, even if the user wants to provide
  a local file.

### 6. Run the task once required inputs are ready

When the payload is ready, run the task directly:

```bash
oo cloud-task run "<packageName>@<version>" \
  --block-id "<blockId>" \
  --data '<json object>' \
  --json
```

`cloud-task run` already performs local input validation before task creation,
so do not add a separate validation-only step unless the user explicitly asks
for it.

Read `taskID` from the JSON response.

Immediately report:

- selected package ID and version
- selected block ID
- submitted key inputs
- task ID
- fallback candidate, if one exists

Do not hide the task ID behind a long wait.

### 7. Handle long-running tasks safely

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

- Wait immediately only if the task looks short or the user explicitly wants to
  wait now.
- Do not default to `6h` or longer in one call unless the user explicitly asks.
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

If the final task result exposes a remote artifact URL and pulling it back to
local would clearly help the user, prefer `oo file download <url>` after the task
has succeeded.

Rules:

- Use `[outDir]` only when the user asked for a specific destination.
- Never add `--json` to `oo file download`. Successful output is a localized
  human-readable line on stdout, not a JSON object.
- When `[outDir]` is omitted, `oo file download` uses the configured
  `file.download.out_dir` value if present, otherwise `~/Downloads`.
- If the inferred saved filename would be opaque to the user, such as a UUID,
  hash, task ID, or generic `download`, choose a concise descriptive base name
  and pass it with `--name`. Omit `--name` only when the server metadata already
  yields a clear name the user can recognize.
- Let `oo file download` create missing directories, avoid overwrite by renaming,
  and print the absolute saved path.
- Do not reimplement the download with `curl`, ad hoc scripts, or manual file
  writes when `oo file download` can handle the URL.
- When reporting success, include the absolute saved path printed by
  `oo file download`.

### 9. Report outcomes clearly

On success:

- state the final task status first
- summarize the useful result
- include package, version, block ID, and task ID
- if you downloaded a remote artifact, include the absolute saved path

On still-running tasks:

- state that the task was created successfully
- state that it is still running
- include the task ID
- offer the next sensible action: wait again or check a result snapshot

On failure:

- report whether the failure came from no package match, missing input,
  unsupported input shape, task failure, or environment or auth limitations

If the failure output includes HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`,
classify it as insufficient credit or overdue billing and direct the user to
https://console.oomol.com/billing/recharge before retrying anything.

## Response style

- Be decisive.
- Prefer the most specific block over a generic block.
- Prefer recoverable progress over fragile one-shot waiting.
- Never claim a capability that was not proven by `packages search`, `packages info`, or
  command output.
