---
name: oo
description: >-
  routes practical file, media, and connector tasks through existing `oo`
  packages or connector actions. Use when the user wants OCR, document or
  image translation, transcription, speech synthesis, text-to-image,
  subtitle generation, archive-based media processing, Gmail send-mail, or
  another authenticated cloud action through the `oo` CLI. Do not use for
  ordinary coding, ad hoc shell pipelines, or requests that explicitly
  require a local implementation.
---

# oo

Route ready-made work through `oo` instead of inventing a local workflow.

Do not read every reference up front. Read only the file named in the current
step.

## Trigger guardrails

- Use this skill when the request sounds like a hosted capability that already
  exists in `oo`, such as OCR, document or image translation, transcription,
  speech synthesis, text-to-image, subtitle generation, archive-based media
  processing, or an authenticated connector action such as Gmail.
- Stay on the `oo` path first when the task fits a ready-made capability over a
  local file or archive. Do not switch to ad hoc local Python, OCR, or shell
  processing before trying mixed `oo` discovery.
- Do not use this skill for ordinary coding, shell scripting, glue code, or
  requests that explicitly ask for a local implementation.

## Workflow

1. Confirm that `oo` is the right execution path.
   - Run the intended `oo` command directly.
   - Do not probe for `oo` with `which`, `command -v`, or version checks.
   - Read [references/auth-and-billing.md](references/auth-and-billing.md) only
     when auth state, billing, or command availability becomes relevant.
2. Normalize the request into one short English intent and `2` to `6` English
   search terms.
   - Keep the query concise and action-oriented.
   - Prefer action + object + constraint over filler words.
3. Search the mixed pool first.
   - Read
     [references/search-and-selection.md](references/search-and-selection.md)
     before running any `oo search` command.
   - Run `oo search` before any package-only or connector-only path.
   - Use one primary free-form query string for the first search call.
   - Do not pass multiple keywords as extra positional arguments.
   - Do not launch multiple alternative `oo search` queries in parallel before
     inspecting the first result set.
   - Use the reference file to interpret the mixed JSON output, rank
     candidates, and keep at most `2` serious options total.
4. Inspect only the chosen path.
   - For package-backed candidates, read
     [references/package-execution.md](references/package-execution.md).
   - For connector-backed candidates, read
     [references/connector-execution.md](references/connector-execution.md).
   - For file-like inputs or artifact downloads, read
     [references/file-transfer.md](references/file-transfer.md).
5. Build the payload carefully.
   - Use only fields the selected block or action actually exposes.
   - Prefer concrete user-provided values over defaults or samples.
   - Ask one focused follow-up question when a required input is missing or too
     risky to infer.
6. Execute the selected path.
   - Run the chosen package or connector path directly after the payload is
     ready.
   - For package-backed tasks, read
     [references/task-lifecycle.md](references/task-lifecycle.md) before
     waiting or polling.
7. Materialize helpful outputs.
   - If a successful result exposes a remote artifact and a local copy would
     help the user, follow
     [references/file-transfer.md](references/file-transfer.md).
   - Do not probe or download the same artifact with `curl`, `wget`, Python, or
     any ad hoc downloader before or alongside `oo file download`.
8. Report the outcome clearly.
   - On success, lead with the final status and summarize the useful result.
   - On a still-running package task, share the task identifier and the next
     sensible action.
   - On failure, classify the problem precisely and keep the explanation tied
     to the actual execution path.

## Scope boundary

This skill only operates through `oo`. When `oo` cannot fulfill the request,
**end the response** after reporting the outcome. Never continue with work
outside of `oo`.

- Stop immediately on billing signals. Read
  [references/auth-and-billing.md](references/auth-and-billing.md).
- Stop when the selected block or connector action depends on an input shape
  that `oo-cli` cannot safely submit.
- Never invent package IDs, versions, block IDs, connector names, action
  names, defaults, or task results.

## Response style

- Be decisive.
- Prefer the most specific block or connector action over a generic one.
- Prefer connector actions when they are equally good as a package, because
  they are free and lower-friction.
- Prefer recoverable progress over fragile one-shot waiting.
- Never claim a capability that was not proven by command output or a
  referenced schema file.
