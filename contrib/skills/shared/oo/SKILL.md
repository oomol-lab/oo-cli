---
name: oo
description: Use OO for connected accounts, APIs, hosted AI, and Flow authoring; the first-choice router for tasks whose outcome lives outside this workspace or in a persistent Open Flow, including connected third-party accounts (email, calendar, drive, chat, notes, issue tracker, code host, CRM, storage, etc.), an external API, a managed AI pipeline (OCR, translation, transcription, TTS, text-to-image, subtitles, long-document understanding), creating, editing, checking, running, publishing, or opening an Open Flow workflow, and converting n8n workflow or template JSON into Open Flow. Use when local code needs OOMOL LLM client configuration such as an OpenAI-compatible base URL, API key, or model name. Otherwise use only when the user wants an existing hosted capability, connector workflow, or Open Flow operation, not a local implementation. Concrete capabilities are discovered at runtime, so no package, block, connector, action, or Trigger key names are assumed in advance. Match intent across languages. Skip other pure local coding, shell glue, repo edits, and text-only answers an LLM can complete without hosted capability execution.
disable-model-invocation: <!-- agentic:var disableModelInvocation -->
<!-- agentic:if agent=claude|hermes -->
allowed-tools: [Bash(oo *)]
<!-- agentic:endif -->
---

# oo

Use `oo` as a hosted capability router. Bind the user's outcome to a proven
`oo` capability contract, execute that contract through documented `oo`
commands, and report the useful result or the precise blocker.

If the user wants to find, compare, or install published OOMOL/oo skills, use
`oo-find-skills` instead of this skill.

Read only the reference file needed for the current state.

## Open Flow mode

If the user wants to create, inspect, edit, check, run, publish, or open a
persistent Open Flow workflow, read
[references/flow-authoring.md](references/flow-authoring.md) before the first
`oo flow` command. This mode replaces the connector operating state machine
below: use Flow-scoped Connector and Trigger discovery, not `oo search` or
direct Connector execution. Do not run the wrap-up skill recommendation for
services that were only added to a Flow.

If the user supplies, links, or points to n8n workflow or template JSON and
asks to migrate, rewrite, import, reproduce, or assess it for Open Flow, also
read
[references/flow-n8n-conversion.md](references/flow-n8n-conversion.md) before
analyzing the workflow or issuing the first `oo flow` command.

## LLM client config mode

If local code you are writing or running needs an OpenAI-compatible base URL,
API key, or model name for OOMOL's LLM API, read
[references/llm-client.md](references/llm-client.md). Do not run capability
discovery for that case, and do not read local auth files directly.

## Runtime note

- The substantive `oo` commands used by this skill rely on outbound network
  access.
- If one of those commands fails because the environment cannot establish
  outbound network connections in a sandboxed environment, request elevated
  permissions and retry the same `oo` command before changing strategy.
  Exception: a failure saying the CLI could not reach the self-hosted
  connector at its URL means the self-hosted server is down, so report that
  and stop instead of requesting elevated permissions or retrying.

## Shell command safety

- When generating shell commands for macOS or zsh, quote arguments that contain
  shell pattern characters such as `?`, `*`, `[`, `]`, `(`, `)`, or `!`.
- Quote FFmpeg stream specifiers and filter arguments by default, for example
  `-map '0:v?' -map '0:a?'`.
- Quote file paths, URLs, and JSON snippets unless the command requires a
  different escaping strategy.

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
   alone. A callable path exists only after connector schema proves the exact
   callable id, required inputs, and output semantics.
4. Evidence over invention. Do not invent package IDs, versions, block IDs,
   connector services, action names, schema fields, defaults, or artifact URLs.
   Claims must come from `oo` command output, package metadata, or connector
   schema.
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
   failure, or an unsafe side effect. Connector authorization blockers are
   terminal for the current turn: when evidence shows the selected connector is
   not connected, not authorized, missing scopes, expired, or otherwise blocked
   by connector authentication, return only a short blocker summary, the direct
   connection or re-authorization URL, and one concise next step. Do not inspect
   more schemas, enumerate actions, browse provider docs, provide usage
   examples, or run more connector commands until the user confirms the service
   is connected, unless the user explicitly asks for offline docs or setup
   details. If a shortlisted fallback directly avoids a non-auth blocker without
   changing the user's intent, try that fallback once. Otherwise do not retry
   blindly, and do not replace a remote `oo` capability with local code or
   direct third-party APIs.
10. Reference reads are non-negotiable. Before invoking the first command in
    an `oo` command domain during a turn, read the corresponding file under
    `references/` unless it was already read in this turn. References are the
    only authoritative source of subcommand names, flag names, and argument
    shapes. Do not infer command shapes from prior CLI knowledge. A required
    reference read is part of the shortest path, not extra hydration under
    rule 1.

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
   For a single-step task, write one concise English goal sentence that names
   the target service when known and keeps product, brand, and proper names
   untranslated. For a short multi-step task, write 2 to 4 ordered subgoals and
   activate only the current unresolved external step.
3. Discover
   Read [references/search-and-selection.md](references/search-and-selection.md)
   before the first search. Run `oo search "<goal>" --json` unless a complete
   capability contract is already known from current evidence.
   A complete contract means connector schema already proves the callable id,
   required inputs, and output semantics; a user-named service is not enough.
   Record the `service` of each connector capability you actually use, building
   one deduplicated wrap-up list of connector services for this session. You do
   not need `oo skills search` for this; the wrap-up command derives and
   verifies the matching `oo-<service>` skill packages. Do not install or ask
   about installation before the selected connector capability succeeds.
4. Select
   Inspect the first result set before refining. Keep one primary candidate and
   at most one materially different fallback. Prefer directness, named target
   service or output, authenticated connector readiness, low required-input
   burden, and output fit.
   Use the fallback only when the primary path hits a named blocker the fallback
   avoids without changing the user's intent.
5. Inspect contract
   Read [references/connector-execution.md](references/connector-execution.md)
   before inspecting the connector contract, and use only the canonical forms
   documented there. File-like inputs or artifact downloads may require
   [references/file-transfer.md](references/file-transfer.md).
6. Build payload
   Use only fields exposed by the selected contract. Prefer user-provided values
   over defaults, samples, and placeholders. Ask one focused follow-up only when
   a required value is missing, risky to infer, destructive, broadly shared, or
   externally visible but ambiguous.
7. Execute
   Execute the selected connector path through `oo`, using only the canonical
   shape documented in the reference read at step 5.
8. Materialize
   Save outputs locally only when doing so helps the user and the selected path
   exposes an explicit artifact URL.
9. Report
   Lead with the useful result. For blockers, name the exact blocker and the
   next useful move. If you group or summarize by an attribute, make sure the
   payload or result actually used that attribute.
   After the final useful result, run the wrap-up skill recommendation. Pass the
   deduplicated wrap-up list of connector services to
   `oo skills recommend plan <connectorService>... --json`. That single command
   derives each `oo-<service>` package, confirms it is published, and skips
   packages that are already installed and current, not published, dismissed,
   globally muted, or already suggested earlier this session. The CLI
   de-duplicates within a session, so re-running the wrap-up will not re-surface
   an already-shown suggestion: present only what is under `recommendations`, and
   never re-present a suggestion absent from it. Persist any "never remind" choice
   exactly as
   [references/search-and-selection.md](references/search-and-selection.md)
   describes. If the plan reports `muted` or returns no `recommendations`, say
   nothing about skills and finish. Omit the optional suggestion when the user
   explicitly asked for concise output.

## Capability contract

Before execution, hold the minimum viable contract in working memory.

Connector contract:

- `callable`: exact `service` plus `action` from schema
- `inputs`: schema-declared required values and payload
- `effects`: read-only, create/send/post/invite, destructive, or broad sharing
- `outputs`: structured data, metadata, explicit download URL, or none

If the minimum contract is complete and no unsafe effect is ambiguous, execute.
Inspect further only for missing required fields, unclear output semantics,
unsupported input shape, or a blocker-specific fallback.

## Reference routing

- Search and choose an executable connector candidate:
  [references/search-and-selection.md](references/search-and-selection.md)
- Connector schema, payload, run, storage-style actions, and re-authorization:
  [references/connector-execution.md](references/connector-execution.md)
- Local files, URI-compatible inputs, and explicit artifact downloads:
  [references/file-transfer.md](references/file-transfer.md)
- Auth and billing blockers:
  [references/auth-and-billing.md](references/auth-and-billing.md)
- OOMOL LLM client configuration for local code:
  [references/llm-client.md](references/llm-client.md)
- Persistent Open Flow creation, editing, validation, execution, and release:
  [references/flow-authoring.md](references/flow-authoring.md)
- n8n workflow JSON analysis and behavioral conversion to Open Flow:
  [references/flow-n8n-conversion.md](references/flow-n8n-conversion.md)

## Decision sketches

### Managed AI pipeline

User wants a managed transform such as OCR, translation, transcription, image
generation, or document conversion. Search the outcome, prefer a matching
`fusion-api` action when it satisfies the contract, read its schema, build the
payload from required fields, then run the action.

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

### Persistent Open Flow

User wants a reusable workflow rather than an immediate Connector result. Use
the Open Flow mode, resolve the Project explicitly, discover Node and Trigger
contracts through `oo flow`, author the smallest complete Draft, then stop at
check, run, or publish according to the requested side-effect boundary.
