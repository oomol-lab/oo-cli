# Open Flow authoring

Use this mode for persistent workflows in the selected Hosted or self-hosted
deployment. Use `--json` for every command whose output feeds another step.
Put `oo` global options such as `--lang` and `--debug` before `flow`.
Use `--team <name>` to select the Hosted team for the whole invocation; it can
appear before `flow` or after a subcommand and overrides environment and saved
team selections.

## Contents

- [Choose the requested boundary](#choose-the-requested-boundary)
- [Resolve and retain context](#resolve-and-retain-context)
- [Discover contracts and readiness](#discover-contracts-and-readiness)
- [Create an atomic graph](#create-an-atomic-graph)
- [Execution and input mappings](#execution-and-input-mappings)
- [Triggers](#triggers)
- [Verify, run, and publish](#verify-run-and-publish)
- [Opening Workbench](#opening-workbench)
- [Failure handling](#failure-handling)

## Choose the requested boundary

Before issuing commands, decide where the user's request ends:

- **Draft**: create or edit the Flow, then check it.
- **Run**: complete the Draft path, then execute the Draft and read its result.
- **Publish**: prove semantic and runtime readiness, then update Live.
- **Open**: resolve a fresh Workbench URL and hand it to the requested browser.

`oo flow run` can execute external side effects. Publishing changes Live;
enabling a published Flow allows automatic Trigger execution. Perform these
actions only when the user requested the corresponding boundary.

## Resolve and retain context

Use a known Flow ID or unambiguous exact name directly with `inspect`, `show`,
or the requested mutation. Use `oo flow list --json` only when the target is
unknown or ambiguous; follow `nextCursor` only while resolving that target.
For a requested new Flow, call `oo flow create <name> --json` directly. When a
specific Hosted team is required, use
`oo --team <team-name> flow create <name> --json`. Use the same team selector
for later discovery, editing, checking, running, and opening the Flow.

Retain the Flow ID, current Draft Revision ID, observed Live Publication ID,
selected contracts and Connections, and identities returned by mutations.
Use `--flow <flow-id>` on Connector discovery commands to fix that Flow's Team
scope. Keep the user's chosen deployment and account throughout the work.

`oo flow inspect <flow> --json` returns a compact Draft graph, input mappings,
port handles, module identities, and Live summary. Use `--full` only when
schemas, Code source, or complete Revision content are needed. Inspection does
not perform a Revision check. Use narrower `node show`, `code show`, or
`trigger list` commands for an isolated fact. Retain `draft.revisionId` from
inspection and update it from each accepted mutation; avoid repeated reads
while those facts remain current.

## Discover contracts and readiness

Discover Connector Nodes with
`oo flow connector search "<query>" --flow <flow-id> --json`, then inspect
the selected action with
`oo flow connector show <action> --flow <flow-id> --json`.
Search returns ranked matches, not an exhaustive catalog or proof of
authorization. Retry one provider-qualified query for a missing action; use
`oo flow connector providers --flow <flow-id> --json` only when the provider's
availability remains uncertain. Keep discovery and execution in `oo flow`.

Take action IDs, Trigger keys, Connection IDs, input/output handles, and config
fields from command output. Distinguish:

- **Draft-ready**: the action contract is known. Connector Nodes may be saved
  without a Connection; report missing configuration separately from the check.
- **Runtime-ready**: authenticated actions and provider Triggers have active
  Connections and the required permissions before Run or Publish. An action
  marked `authenticated: false` does not require an account.

For a Draft Run, readiness applies to the selected Trigger's reachable nodes
and dependencies. Unrelated branches may still have diagnostics in the full
check. Publish and Live Run require the complete Flow to be valid and ready.

An omitted Connector connection or `connection: "default"` chooses an active
default, or the sole active Connection when no default exists. If selection is
uncertain, use
`oo flow connector connections <service> --flow <flow-id> --json`.
At the Draft boundary, save an unconfigured Connector only when that fulfills
the requested edit, then report its missing Connection. Provider Triggers
require an active Connection at creation.

Preserve explicit inactive, expired, or permission-denied diagnostics and the
returned re-authorization guidance. An active account alone does not prove
action or Trigger permission, and a catalog miss alone is not an auth blocker.
Code Connector access has its own permission contract: inspect
`oo flow connector code-access <flow> --json` and
`oo flow connector candidates <flow> <provider> --json` only when the intended
Code needs it. A Connector Task's Connection does not grant Code access.

For `--set`, use the port's schema to supply the value. `field=@file` reads
JSON, `field=-` reads stdin, and `--set @file` or `--set -` merges an object.
Use `--unset <field>` to remove a supported literal or config value.

## Create an atomic graph

Prefer one `oo flow apply` for a complete graph or a coordinated edit. Discover
the current request shape locally before constructing it:

```bash
oo flow schema apply --json
oo flow schema examples --json
oo flow schema example.poll-notification --json
```

Read only the example needed for the intended node family. Examples cover Code,
Connector, LLM, AI Decision, OpenAPI, Condition, Wait, Approval, and Trigger
creation; replace sample actions, Connections, models, port definitions, and
values with proven ones.
Use `oo flow schema <operation-kind> --json` for a particular edit.

For AI Decision, read `schema example.decision` and configure its `target` and
named questions. Each question's output is a complete answer object; read its
schema before using it in a predicate or downstream input.

For a user-requested API operation backed by an OpenAPI document, read
`schema example.openapi`. Fix the actual document, operation, server URL,
inputs, and auth bindings. Its outputs are `body`, `statusCode`, and `headers`.
Credentials must use supported Variable or upstream-output bindings, not
literal values. This contract supports JSON operations; binary/streaming
responses, OAuth login, redirects, and automatic retries are unsupported.
Do not use it to bypass a missing Connector or Trigger authorization.

The canonical request is `{"version": 1, "operations": [...]}`. Operations are
ordered, use explicit Node/Task/Module IDs, and can create resources, connect
execution Edges, and set input mappings in one Draft transaction. Include the
observed `before` value for an existing field; omit it only when that field was
absent. A request is a one-shot edit, not a persistent local Flow definition.

```bash
oo flow apply <flow> --file <path|-> \
  --expected-revision <revision-id> --idempotency-key <edit-key> --json
```

Choose one edit key before submission and retain the exact file contents,
arguments, and base Revision for recovery. An explicit idempotency key requires
`--expected-revision` for Draft mutations. Use a new key for a different edit.

The convenience request with `nodes`, `triggers`, and `edges` is still accepted
for simple creation. Its Edges contain `source`, `target`, and optional
`sourceHandle` for an execution branch. Connector `inputs` are literal values;
Code `inputs` and `outputs` declare port definitions. Use canonical operations
when source input mappings or fully configured built-in nodes are required.
Code source in the convenience request may be inline JavaScript or `@file`;
if the request comes from stdin, its Code cannot also use stdin.

For isolated edits, use `connector add/set`, `node add/set/input/remove`,
`code edit/set`, `trigger add/set/remove`, or `connect/disconnect` with the
observed Revision and a retained edit key. Deletions require `--yes`.

## Execution and input mappings

An execution Edge determines which node runs next. An input mapping determines
where a node reads data. Configure both when a downstream node consumes an
upstream result:

```bash
oo flow connect <flow> <source> <target-node> [branch] \
  --expected-revision <revision-id> --idempotency-key <edge-key> --json
oo flow node input <flow> <target-node> <input> <source> <output> \
  --expected-revision <new-revision-id> --idempotency-key <input-key> --json
```

These are separate writes. For an atomic change, combine `graph.edge.connect`
and `graph.node.input.set` in one apply request, using the schema-reported
`kind: "sources"` mapping and its explicit source Node ID and output handle.

Compare source output and destination input schemas and nullability before
setting a mapping. Use `connector show`, `node show`, or `inspect --full` for
those definitions. A dynamic schema `{}` does not convert values. For an array
to string conversion, use Code that explicitly returns the required string,
declare its ports, and map that output into the destination input.

Condition Edges use the selected case's output handle or `otherwise` as their
branch. They route execution; the target's data still needs its own input
mapping. Ensure side-effect nodes are reachable only through the intended
branch. Use the current schema/example for the Condition predicates.

## Triggers

Discover provider Triggers with `oo flow trigger search "<query>" --json` and
inspect the exact key with `oo flow trigger show <key> --json`. Use its actual
config and output handles; webhook, cron, poll, and integration Triggers have
different output contracts.

For simple creation, use
`oo flow trigger add <flow> <manual|webhook|cron|trigger-key> --json` with the
observed Revision, an edit key, and only applicable `--connection`, `--set`,
`--every`, `--cron`, or `--timezone` options. Provider definitions resolve into
poll or integration nodes. Prefer atomic apply for creation, execution Edges,
and input mappings together. Configure complex Webhook behavior from its
schema or in Workbench.

An Error Trigger is created through `schema example.error` and canonical apply.
Select already-published upstream Flows and set their IDs through
`graph.trigger.sources.set`, using the operation schema and observed prior
value. It listens for failures of those Flows' automatic runs after its own
Flow is published and enabled. Its outputs
are `workflow`, `execution`, and `error`; it does not catch an individual node's
failure and resume that same execution. Keep creation at the Draft boundary
unless automatic error handling was explicitly requested.

When a Trigger was created but a later Edge or mapping failed, retain its
returned ID and retry only the missing change. Inspect before creating a second
Trigger. Use `trigger set` for supported later changes.

## Verify, run, and publish

A successful apply returns an authoritative check of the accepted Revision.
Use that result when available. If the final mutation has no check, run
`oo flow check <flow> --revision <revision-id> --json` once. Inspection provides
structure and source context when needed; it does not replace this check.
At the Draft boundary, report the latest Revision, validity, and missing
Connections or other diagnostics.

For explicitly requested execution, prove runtime readiness, select the
Trigger, and submit one repeatable Run:

```bash
oo flow run <flow> --source draft --trigger <trigger-id> \
  --expected-revision <revision-id> --idempotency-key <run-key> --wait --json
```

A sole Manual Trigger is selected automatically. For other Triggers, provide
`--outputs <json|@file|->` matching their named output contract. `--input`
provides per-Node input overrides keyed by Node ID then input handle.
For a Live Run, use the observed `--expected-publication` instead of
`--expected-revision`.

Interpret the response as well as its exit code:

- `0`: successful command or accepted asynchronous operation. Read
  `runs result <run-id> --json` after the Run is `completed`.
- `1`: error, failed/canceled Run, or `indeterminate`. Read
  `runs events <run-id> --json` for diagnostics; do not blindly repeat effects.
- `2`: an unresolved Wait or Approval. Inspect `run.waits`; use
  `runs resolve <run-id> <wait-id> <continue|approve|reject> --json` only for the
  user's requested decision, then wait again.
- `3`: the wait budget expired or publication is pending. The operation
  continues. Use `runs wait <run-id> --json` or
  `publications wait <flow> <operation-id> --json` instead of resubmitting.

For Run/publication waiting, `--timeout` is a budget in milliseconds, defaulting
to 60000. On `node set`, it changes the node's execution timeout. Follow Run
events only when needed with `runs events <run-id> --after <sequence> --follow
--json`; it emits NDJSON pages. Retain `nextAfter` to resume. For large results,
use `runs results`, `runs read-result`, and `runs download-result` as needed.

Publish a valid, runtime-ready Revision with a retained publication key:

```bash
oo flow publish <flow> --expected-revision <revision-id> \
  --expected-publication <publication-id|none> \
  --idempotency-key <publish-key> --json
```

`none` means no Live Publication was observed. Use
`oo flow enable <flow> --expected-publication <publication-id> --json` only
when the user also requested automatic execution.

## Opening Workbench

Use `oo flow open [flow]` for the user's system browser. For an agent-hosted
in-app browser, run `oo flow workbench [flow] --json`, read its top-level `url`,
and navigate immediately. Hosted URLs contain a short-lived, one-time sign-in
code. Never log, persist, share, or reuse it; obtain a fresh URL if navigation
fails or the URL was consumed. If no in-app Browser capability is available,
return the fresh URL and explain its lifetime.

An already-open Workbench receives revision notifications after mutations.
Verify writes from CLI output; do not reload or reopen it merely to display a
change. Use browser interaction when requested or when diagnosing a stale view.

## Failure handling

- On `flow.revision-conflict`, inspect the latest Draft and recompute the edit
  with a new key. Preserve concurrent changes.
- On `flow.mutation-outcome-unknown`, retain the returned key and base Revision.
  Retry only with that same key, fixed Revision, identical arguments, and
  identical file contents. Inspect afterward if confirmation remains missing.
- A successful apply is accepted even when its check is invalid or unavailable.
  Retain its Revision; repair diagnostics or check that Revision later instead
  of resubmitting the accepted mutation.
- On missing Connector or Trigger authorization, report the specific returned
  connection, permission, or re-authorization action. Do not replace a Flow
  operation with a direct third-party call.
