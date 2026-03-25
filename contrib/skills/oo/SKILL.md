---
name: oo
description: Use the oo CLI to translate natural-language requests into English search terms, inspect candidate OOMOL packages, choose blocks, collect required inputs, run validated cloud tasks, and manage bounded waits for long-running jobs. Use when the user wants to complete a task with OOMOL packages, not when they want to develop or debug oo-cli itself.
---

# oo

Use this skill when the user wants to complete a practical task through the
`oo` CLI, such as generating an artifact, transforming content, or running a
cloud block.

This skill is for operating `oo`. It is not for developing, debugging, or
changing `oo-cli` itself.

Read [references/oo-cli-contract.md](references/oo-cli-contract.md) when you
need exact command syntax, JSON shapes, auth behavior, timeout rules, or known
stop conditions.

## Environment checks

Before doing anything substantial:

- Prefer `oo --lang en ...`.
- If `oo` is unavailable, stop and explain that the environment does not have a
  runnable `oo` CLI.
- If authentication is uncertain, run `oo --lang en auth status` before the
  first remote command.
- Treat auth as usable only when the status output shows a valid active
  account.
- If auth status says logged out, missing, invalid, or request failed, stop and
  ask the user to repair authentication before continuing.

## Non-negotiable rules

- Always use `--json` with:
    - `search`
    - `package info`
    - `cloud-task run`
- Never add `--json` to `cloud-task wait`.
- Never invent package IDs, versions, block IDs, handle names, defaults, or
  task results.
- Do not continue past auth precheck unless `oo --lang en auth status` confirms
  a valid active account.
- `cloud-task run` must use `PACKAGE_NAME@SEMVER`.
- `cloud-task run` must include a real `--block-id`.
- If `search` returns zero packages, stop and tell the user that `oo` does not
  currently have a matching capability.
- Ask follow-up questions only when required inputs are missing or too risky to
  infer.
- Stop when the selected block depends on an input shape that `oo-cli` cannot
  safely submit.

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

Combine the keywords into one concise English search query.

### 2. Search for candidate packages

Run:

```bash
oo --lang en search "<english query>" --json
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
oo --lang en package info "<packageName>@<version>" --json
```

```bash
oo --lang en package info "<packageName>" --json
```

Then choose the best block using only returned metadata.

Prefer a block that:

- directly matches the requested action
- requires fewer mandatory inputs
- has clearer input semantics
- produces output closer to the user's goal

Use `blocks[].blockName` as the block identifier for execution. Do not use the
human-facing block title as `--block-id`.

If search does not provide a version, inspect the package by name first and use
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
`oo-cli` local validation rejects most non-secret content media types, so do
not pretend file, image, or other special payloads can be passed safely as
normal JSON values.

### 6. Validate before creating the task

If the payload is non-trivial, or if the user just confirmed important values,
first run:

```bash
oo --lang en cloud-task run "<packageName>@<version>" \
  --block-id "<blockId>" \
  --data '<json object>' \
  --dry-run \
  --json
```

If dry-run succeeds, run the real task:

```bash
oo --lang en cloud-task run "<packageName>@<version>" \
  --block-id "<blockId>" \
  --data '<json object>' \
  --json
```

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
oo --lang en cloud-task wait "<taskId>" --timeout "<window>"
```

Rules:

- Wait immediately only if the task looks short or the user explicitly wants to
  wait now.
- Do not default to `6h` or longer in one call unless the user explicitly asks.
- Remember that a single `wait` call cannot exceed `24h`.
- If `wait` times out, treat that as "still running", not as failure.
- After any non-zero `wait` exit, immediately check:

```bash
oo --lang en cloud-task result "<taskId>" --json
```

Use the result snapshot to distinguish:

- still running
- failed
- succeeded after the wait command exited

If the user wants to continue, run another bounded wait window instead of
re-creating the task.

### 8. Report outcomes clearly

On success:

- state the final task status first
- summarize the useful result
- include package, version, block ID, and task ID

On still-running tasks:

- state that the task was created successfully
- state that it is still running
- include the task ID
- offer the next sensible action: wait again or check a result snapshot

On failure:

- report whether the failure came from no package match, missing input,
  unsupported input shape, task failure, or environment or auth limitations

## Response style

- Be decisive.
- Prefer the most specific block over a generic block.
- Prefer recoverable progress over fragile one-shot waiting.
- Never claim a capability that was not proven by `search`, `package info`, or
  command output.
