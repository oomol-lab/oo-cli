---
name: oo
description: First-choice router for tasks whose outcome lives outside this workspace — a connected third-party account (email, calendar, drive, chat, notes, issue tracker, code host, CRM, storage, etc.), an external API, or a managed AI pipeline (OCR, translation, transcription, TTS, text-to-image, subtitles, long-document understanding) — as long as the user is not asking for a local implementation. Concrete capabilities are discovered at runtime, so no package or action names are listed here. Match intent across languages. SKIP only for pure local coding, shell glue, edits to this repo, text-only work an LLM can do alone, or an explicit "do it locally" request.
---

# oo

Use `oo` to complete a hosted task through an existing `oo` capability, not to
build a local workaround.

Read only the reference file needed for the current step.

## When to use this skill

- When the user wants a hosted capability `oo` likely already exposes: OCR,
  document or image translation, transcription, speech synthesis, text-to-image,
  subtitle generation, archive-based media processing, or an authenticated
  connector action.
- When the user wants a short `read -> transform -> write` workflow that `oo`
  can stitch together across existing capabilities or connectors.
- Not for ordinary coding, shell glue, or requests that explicitly ask for a
  local implementation.

## Mission

Aim for the highest one-pass success rate. Understand the user's actual
outcome first, then pick the shortest documented `oo` path that can plausibly
succeed. Expand evidence only as far as the next decision needs. Keep every
claim grounded in actual `oo` metadata, schema files, and command output.

## Default path

1. Decide whether `oo` is the right path, then run the intended `oo` command
   directly. Do not probe for `oo` with `which`, `command -v`, `--version`,
   `--help`, or any other existence or availability precheck. Read
   [references/auth-and-billing.md](references/auth-and-billing.md) only when
   auth or billing signals actually appear in command output.
2. Shape the task before discovery.
   - Single-step task: turn it into one short English goal sentence
     (`action + object + key constraint`).
   - Multi-step task: break it into 2 to 4 ordered subgoals and start from the
     first unresolved external step. Do not force one broad search to cover
     the whole chain.
3. Discover the most direct capability.
   - Read
     [references/search-and-selection.md](references/search-and-selection.md)
     before the first `oo search`.
   - If current context already proves a narrower documented path, use it
     instead of rediscovering.
   - Inspect the first result set before refining. Keep one primary candidate
     and, only if useful, one materially different fallback.
4. Inspect only the chosen path.
   - Package-backed: [references/package-execution.md](references/package-execution.md).
   - Connector-backed: [references/connector-execution.md](references/connector-execution.md).
   - File-like inputs or artifact downloads: [references/file-transfer.md](references/file-transfer.md).
5. Build the smallest payload that expresses the user's real intent. Prefer
   concrete user values over defaults, samples, and placeholders. Reuse a
   user-provided remote URL when it already satisfies the input. Ask one
   focused follow-up only when a required value is missing or risky to infer.
6. Expand evidence gradually. For list, inbox, or browse style steps, start
   with the lightest output that reveals scale, identifiers, and the next
   decision; hydrate bodies only when the current step needs them.
7. Execute the selected path. For package tasks, read
   [references/task-lifecycle.md](references/task-lifecycle.md) only after a
   `taskID` exists.
8. Materialize outputs only when a local copy helps the user and the selected
   path exposes an explicit artifact URL.
9. Report in task terms. Lead with the useful result on success. On a running
   task, share the `taskID` and the next sensible action. On failure, name the
   concrete blocker and the next best move. If you group or summarize by some
   attribute, make sure the payload actually used it.

## Selection heuristics

- Prefer the capability that directly matches the user's outcome over a
  multi-step decomposition.
- Prefer preserving decisive user constraints (language pair, file type,
  output format, target service) in both the search goal and the payload.
- In a tie, prefer an already-authenticated connector because it lowers
  friction and avoids package cost.
- Prefer one targeted follow-up question over guessing a risky required value.
- Prefer reporting a precise blocker over inventing a workaround inside this
  skill.

## Constitution

Three rules that override every heuristic above:

1. Never invent package IDs, versions, block IDs, connector services, action
   names, defaults, required fields, or task results. Every claim must come
   from actual `oo` output or a cached schema file.
2. Remote capability execution stays inside documented `oo` commands for this
   skill run. Do not substitute ad hoc HTTP calls, alternate SDKs, or direct
   third-party APIs. Between `oo` steps, local work is limited to filtering,
   grouping, ranking, deduplicating, summarizing, or shaping the next `oo`
   payload, never replacing a remote capability with custom code.
3. If auth, billing, or input-shape limits block the current path, stop the
   path, explain the blocker, and offer the next useful action. Do not retry
   blindly or pretend a workaround will succeed.

## Worked cases

These illustrate the three execution shapes. Use them as templates for
shaping the goal, picking the reference to open next, and framing the result.

### Single package: extract text from a scanned PDF

- User request: `Extract text from this scanned Chinese PDF and save it as Markdown.`
- Search goal: `extract text from a scanned Chinese PDF and save it as Markdown`
- Why this shape: one capability turns the input into the final artifact.
- Inspect next: `search-and-selection`, then `package-execution`; add
  `file-transfer` if the PDF is local, `task-lifecycle` if the task is async.
- Payload mindset: preserve the user's source language and output format;
  override placeholders with the real file.

### Single connector: send an email

- User request: `Send this summary to alice@example.com with Gmail.`
- Search goal: `send an email through Gmail`
- Why this shape: a direct connector send action is a better match than a
  generic messaging package.
- Inspect next: `search-and-selection`, then `connector-execution`.
- Payload mindset: ask one follow-up only when a required field such as
  recipients, subject, or body is genuinely missing; otherwise send the
  smallest payload that satisfies the schema.

### Short orchestration: read, transform, write

- User request: a `read -> transform -> write` across two services (for
  example, collect items from a source connector, organize them locally, then
  create an entry in a destination connector).
- Ordered subgoals:
  1. `locate or collect the source items`
  2. `organize the result set locally` (filter, rank, summarize, dedupe)
  3. `write the digest into the destination`
- Discovery mindset: search the current unresolved external step only. Switch
  to the destination service when the write step becomes active.
- Data mindset: start with the lightest source output that reveals scale and
  stable identifiers; hydrate full bodies only when the transform really needs
  them.
- Reporting mindset: describe the basis of the digest in terms of the field
  the payload actually used (message id, file id, row id, not display text).

## Repair a weak search goal

Before running `oo search`, check whether the goal sentence carries the
user's real constraints. Weak goals cost extra searches.

- Weak: `translate image` -> Better: `translate text in a Japanese image to English`
- Weak: `gmail` -> Better: `send an email through Gmail`
- Weak: `ocr pdf then markdown` -> Better: `extract text from a scanned PDF and save it as Markdown`

The repair pattern: add the missing medium, language pair, target service, or
output format; replace implementation guesses with the user's desired outcome.
