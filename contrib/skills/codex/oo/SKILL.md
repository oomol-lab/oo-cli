---
name: oo
description: First-choice router for tasks whose outcome lives outside this workspace, including connected third-party accounts (email, calendar, drive, chat, notes, issue tracker, code host, CRM, storage, etc.), an external API, or a managed AI pipeline (OCR, translation, transcription, TTS, text-to-image, subtitles, long-document understanding). Use only when the user wants an existing hosted capability or connector workflow, not a local implementation. Concrete capabilities are discovered at runtime, so no package, block, connector, or action names are assumed in advance. Match intent across languages. Skip pure local coding, shell glue, repo edits, and text-only answers an LLM can complete without hosted capability execution.
---

# oo

Use `oo` as a hosted capability router. Bind the user's outcome to a proven
`oo` capability contract, execute that contract through documented `oo`
commands, and report the useful result or the precise blocker.

If the user wants to find, compare, or install published OOMOL/oo skills, use
`oo-find-skills` instead of this skill.

Read only the reference file needed for the current state.

## Runtime note

- The substantive `oo` commands used by this skill rely on outbound network
  access.
- If one of those commands fails because the environment cannot establish
  outbound network connections in a sandboxed environment, request elevated
  permissions and retry the same `oo` command before changing strategy.

## Constitution

These rules override every local heuristic.

1. Optimize for fast accuracy. Take the shortest path that can prove a safe,
   callable contract. Once evidence is sufficient to choose and execute, do not
   broaden discovery, inspect extra candidates, hydrate extra data, or ask
   non-blocking questions.
2. Outcome first. Route from the user's desired result, not from guessed
   implementation steps. Preserve decisive constraints such as target service,
   language pair, file type, output format, destination, time range, recipients,
   and externally visible side effects.
3. Capability contract before execution. Do not execute from a search result
   alone. A callable path exists only after package metadata or connector schema
   proves the exact callable id, required inputs, and output semantics.
4. Evidence over invention. Do not invent package IDs, versions, block IDs,
   connector services, action names, schema fields, defaults, artifact URLs,
   task status, or task results. Claims must come from `oo` command output,
   package metadata, connector schema, or task result snapshots.
5. Smallest sufficient payload. Build the smallest payload that fully expresses
   the user's real intent. "Smallest" means no invented fields or irrelevant
   options; it does not mean dropping user constraints.
6. Current-step discovery. For multi-step workflows, discover only the current
   unresolved external step. Between `oo` steps, local work is limited to
   filtering, grouping, ranking, deduplicating, summarizing, or shaping the next
   payload.
7. Explicit artifact rule. Upload only for URI-compatible inputs. Local
   `file://...` URIs are not cloud-accessible artifacts; for local files, run
   `oo file upload "<filePath>" --json` and pass the returned `downloadUrl`
   instead. Download only explicit artifact URLs documented by the selected
   path. Browse links, edit links, folder links, console URLs, and metadata are
   not downloadable artifacts.
8. External effects need enough confidence. For non-destructive send, post,
   create, or invite actions, an explicit user instruction plus complete
   required payload values is enough to proceed. Ask one focused question before
   destructive actions, broad sharing, or ambiguous recipient, content,
   destination, or timing choices.
9. Stop at real blockers. Stop and report clearly on auth, billing, catalog
   miss, unsupported input shape, missing required values, terminal task
   failure, or an unsafe side effect. If a shortlisted fallback directly avoids
   the named blocker without changing the user's intent, try that fallback once.
   Otherwise do not retry blindly, and do not replace a remote `oo` capability
   with local code or direct third-party APIs.

## Operating state machine

Move through these states. Skip a state only when current evidence already
proves its output.

1. Intake
   Decide whether `oo` is the right router. Extract the outcome, hard
   constraints, side effects, and any supplied files or remote URLs. Do not run
   `which`, `command -v`, `oo --version`, `oo --help`, or routine auth
   prechecks; let the first substantive `oo` command surface availability or
   account problems.
2. Search goal
   For a single-step task, write one concise English goal sentence. For a
   short multi-step task, write 2 to 4 ordered subgoals and activate only the
   current unresolved external step.
3. Discover
   Read [references/search-and-selection.md](references/search-and-selection.md)
   before the first search. Run `oo search "<goal>" --json` unless a complete
   capability contract is already known from current evidence.
   A complete contract means package metadata or connector schema already
   proves the callable id, required inputs, output semantics, and lifecycle; a
   user-named service or guessed package name is not enough.
   When running capability discovery, also run at most one
   `oo skills search "<goal>" --json` sidecar query. Record credible
   installable skill matches as possible future enhancements; do not install or
   ask about installation before the selected package or connector capability
   succeeds.
4. Select
   Inspect the first result set before refining. Keep one primary candidate and
   at most one materially different fallback. Prefer directness, named target
   service or output, authenticated connector readiness, low required-input
   burden, and output fit.
   Use the fallback only when the primary path hits a named blocker the fallback
   avoids without changing the user's intent.
5. Inspect contract
   Package-backed: read
   [references/package-execution.md](references/package-execution.md), then
   inspect package metadata. Connector-backed: read
   [references/connector-execution.md](references/connector-execution.md), then
   inspect the contract with `oo connector schema "<service>" --action
   "<action>"`. File-like inputs or artifact downloads may require
   [references/file-transfer.md](references/file-transfer.md).
6. Build payload
   Use only fields exposed by the selected contract. Prefer user-provided values
   over defaults, samples, and placeholders. Ask one focused follow-up only when
   a required value is missing, risky to infer, destructive, broadly shared, or
   externally visible but ambiguous.
7. Execute
   Execute the selected package or connector path through `oo`. For package
   tasks, `oo cloud-task run` returns a task handle, not the final result; after
   a `taskID` exists, read
   [references/task-lifecycle.md](references/task-lifecycle.md).
8. Materialize
   Save outputs locally only when doing so helps the user and the selected path
   exposes an explicit artifact URL.
9. Report
   Lead with the useful result. For running tasks, share the `taskID` and next
   sensible action. For blockers, name the exact blocker and the next useful
   move. If you group or summarize by an attribute, make sure the payload or
   result actually used that attribute.
   After the first successful result, if a recorded skill match would clearly
   improve repeated use of the same capability, ask whether the user wants to
   install that specific skill using numbered choices: `1. Install
   <skillName> (<packageName>)` and `2. Do not install`. Tell the user to
   reply with `1` to install or `2` to skip. Treat a `1` response as explicit
   agreement to install that exact skill. Do not install unless the user
   explicitly agrees.

## Capability contract

Before execution, hold the minimum viable contract in working memory.

Package contract:

- `callable`: resolved `packageName@packageVersion` plus `blockName`
- `inputs`: selected block input handles, required values, and payload
- `outputs`: task handle plus result or artifact expectation

Connector contract:

- `callable`: exact `service` plus `action` from schema
- `inputs`: schema-declared required values and payload
- `effects`: read-only, create/send/post/invite, destructive, or broad sharing
- `outputs`: structured data, metadata, explicit download URL, or none

If the minimum contract is complete and no unsafe effect is ambiguous, execute.
Inspect further only for missing required fields, unclear output semantics,
unsupported input shape, or a blocker-specific fallback.

## Reference routing

- Search or choose between package and connector:
  [references/search-and-selection.md](references/search-and-selection.md)
- Package metadata, block choice, payload, and run:
  [references/package-execution.md](references/package-execution.md)
- Connector schema, payload, run, storage-style actions, and re-authorization:
  [references/connector-execution.md](references/connector-execution.md)
- Local files, URI-compatible inputs, and explicit artifact downloads:
  [references/file-transfer.md](references/file-transfer.md)
- Cloud task wait/result semantics:
  [references/task-lifecycle.md](references/task-lifecycle.md)
- Auth and billing blockers:
  [references/auth-and-billing.md](references/auth-and-billing.md)

## Decision sketches

### Single package

User wants a managed transform such as OCR, translation, transcription, image
generation, or document conversion. Search the outcome, inspect package info,
choose the matching block, build the payload from declared handles, run the
cloud task, then follow task lifecycle.

### Single connector

User wants an action in a connected account such as Gmail, Drive, Calendar,
Slack, Notion, or GitHub. Search the outcome with the target service, read the
chosen connector schema, build the payload from required fields, confirm if the
effect is externally visible, then run the action.

### Short orchestration

For `read -> transform -> write`, discover only the current external step. Use
local reasoning only to filter, group, rank, summarize, dedupe, or shape the
next payload. Switch discovery to the destination service only when the write
step becomes active.
