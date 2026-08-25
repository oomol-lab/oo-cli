# Open Flow authoring

Use this mode for persistent Cloud workflows. Use `--json` for every command
whose output feeds another step. Put `oo` global options such as `--lang` and
`--debug` before `flow`.

## Contents

- [Choose the requested boundary](#choose-the-requested-boundary)
- [Resolve and retain context](#resolve-and-retain-context)
- [Discover contracts and readiness](#discover-contracts-and-readiness)
- [Create an atomic graph](#create-an-atomic-graph)
- [Port compatibility](#port-compatibility)
- [Triggers](#triggers)
- [Verify, run, and publish](#verify-run-and-publish)
- [Opening Workbench](#opening-workbench)
- [Failure handling](#failure-handling)

## Choose the requested boundary

Before issuing commands, decide where the user's request ends:

- **Draft**: create or edit the Flow, then inspect or check it.
- **Run**: complete the Draft path, then execute the Draft and read its result.
- **Publish**: prove semantic and runtime readiness, then update Live.
- **Open**: resolve a fresh Workbench URL and hand it to the requested browser.

`oo flow run` can execute external side effects. `oo flow publish` changes Live
state and can enable automatic Trigger execution. Do neither unless the user
explicitly requested that boundary. Do not publish merely to test a Flow.

## Resolve and retain context

Resolve the Project context once. Run `oo flow project current --json` when no
Project is already known; if it identifies the intended Project, omit
`--project` from subsequent commands. Every command also accepts an exact ID or
name through `--project` for a temporary override. Because separate CLI
invocations are stateless beyond the saved context, keep passing that override
when it differs from current. Use `oo flow project list --json` only when there
is no saved context or a name is ambiguous. Use `oo flow project use` only when
the user wants to change the saved default.

The command examples below assume the intended current Project. Append
`--project <project-id>` only when temporarily overriding it.

Likewise, use a known Flow ID or exact name directly with `inspect`, `show`, or
the requested mutation. Use `oo flow list --json` only when the target is
unknown or ambiguous. If the user explicitly asked to create a Flow, call
`oo flow create <name> --json` directly and handle `flow.conflict` instead of
listing first.

Retain a compact fact set for the current turn:

- Project ID, Flow ID, and latest Revision ID.
- Selected Connector service/action, input/output handles, and default or
  explicit Connection.
- Selected Trigger key/provider, config fields, and Connection.
- Node, CodeModule, Task, Trigger, and request-local reference identities
  returned by mutations.

Update the retained Revision from each successful mutation response. Do not
repeat list, search, show, or inspect commands while those facts remain current.
Use `oo flow inspect <flow> --summary --json` for broad
structure, conflicts, or multi-Node edits. Use the narrower `node show`, `code
show`, `trigger list`, or Connector/Trigger discovery command for an isolated
fact; use full `inspect` only when Task, CodeModule source, or complete Trigger
details are needed.

## Discover contracts and readiness

Discover Connector Nodes with
`oo flow connector search <query> --json`, then inspect
the selected action with
`oo flow connector show <action> --json`. Never
substitute `oo search`, `oo connector schema`, or `oo connector run`. Search
returns ranked matches, not an exhaustive catalog or connection status. If a
known action is missing, retry once with a provider-qualified, action-shaped
query, then use
`oo flow connector list --json` only if its existence
remains uncertain.

Do not invent action IDs, Trigger keys, connection IDs, input/output handles,
or config fields. Take them from Flow-scoped search/show output. Keep action
discovery separate from authorization readiness:

- **Draft-ready** means the Connector action contract is known. A Connector
  Node may be saved without `connectionId`, but the resulting Draft remains
  structurally invalid until a Connection identity is selected. Validation is
  deterministic: it requires that identity but does not inspect credentials or
  current provider state.
- **Runtime-ready** means every Connector and provider Trigger used by the
  target Flow has an active Connection. This is required before Run or Publish.

An omitted Connector connection or `connection: "default"` selects the active
default when one exists; otherwise apply can return a Connector identity with
no `connectionId`. If `connector show` has no `defaultConnection` and the edit
would use the default, call `oo flow connector connections <service> --json`
before applying so the missing selection is known in advance. At the Draft
boundary, save an unconfigured Connector only when doing so still fulfills the
requested edit, then report that the Draft is invalid until it is configured.
Before Run or Publish, verify a service with
`oo flow connector connections <service> --json` when
the selected identity has no Connection or readiness is otherwise uncertain.
Require an explicit empty/inactive result or an authorization error before
reporting an auth blocker; a catalog miss alone is never one. Provider Triggers
cannot be created without an active Connection.

`--set field=value` values are JSON. Use `field=@file` for a JSON file or
`field=-` for stdin; use `--set @file` or `--set -` to merge an object.

## Create an atomic graph

Build the smallest complete Draft mutation. Prefer one `oo flow apply` for a
new multi-Node graph or for a Trigger and its first Edge. Use individual Node,
Code, Connector, Trigger, and Edge commands for isolated edits.

`oo flow apply <flow> --file <path|-> [--expected-revision <revision>] --json`
accepts a version-1 one-shot request:

```json
{
  "version": 1,
  "triggers": {
    "incoming": {
      "kind": "provider",
      "key": "<discovered-trigger-key>",
      "connection": "default",
      "config": {}
    }
  },
  "nodes": {
    "transform": {
      "kind": "code",
      "name": "Transform",
      "code": "@transform.js"
    },
    "destination": {
      "kind": "connector",
      "action": "<discovered-action-id>",
      "connection": "default",
      "inputs": {}
    }
  },
  "edges": [
    { "source": "incoming", "output": "payload", "target": "transform", "input": "value" },
    { "source": "transform", "output": "result", "target": "destination", "input": "text" }
  ]
}
```

Trigger kinds are `webhook`, `cron`, and `provider`. Provider Triggers use a
discovered `key` plus optional `connection`, `config`, `every`, `cron`, and
`timezone`. Cron Triggers use `every` or `cron` plus optional `timezone`.

References inside the request are local labels, not persistent IDs. `apply`
creates the Nodes, Tasks, CodeModules, bindings, Triggers, and Edges with one
Draft CAS. It checks the accepted Revision but does not run or publish it. The
request is not a Project export or a persistent local source. If the request
itself comes from stdin, Code source in the same request cannot also use `-`;
use `@file` or inline code instead.

Use `--expected-revision` when the edit was prepared from an earlier read. For
one isolated change, use `oo flow connector add/set`, `oo flow node
add/set/remove`, `oo flow code edit/set`, `oo flow trigger add/set/remove`, or
`oo flow connect/disconnect` instead of wrapping it in a batch request.

## Port compatibility

Before creating each Edge, compare the exact source output and target input
from `connector show`, `trigger show`, or full `inspect`. A concrete output
schema must satisfy the input schema and nullability. Never connect known
incompatible types such as an array output to a string input, even if an older
Draft check accepts the Edge.

An empty schema `{}` is dynamic, not a conversion. Use a dynamic Code Node
between typed ports only when its implementation returns a value accepted by
the destination. For example, convert a message array to text explicitly:

```js
export default function run(input) {
  return { result: input.value.map((item) => item.subject).join("\n") };
}
```

Connect the source to the Code Node's `value` input and its `result` output to
the destination. If the required conversion cannot be expressed with a proven
Code Node contract, stop instead of direct-connecting the ports or claiming the
Flow is valid.

## Triggers

Triggers are not `apply` Nodes; `apply` gives them request-local references only
so their creation and first Edge can share the same Draft transaction.
Discover provider Triggers with
`oo flow trigger search <query> --json` and inspect the
exact key with
`oo flow trigger show <key> --json`. Prefer `apply` when
creating a Trigger and its first `payload` Edge so both changes use one Draft
CAS.

For an isolated Trigger edit, use
`oo flow trigger add <flow> <webhook|cron|trigger-key> --json` plus only
discovered `--connection`, `--set`, `--every`, or `--cron`
values. `trigger add` and a later `flow connect` are separate writes. If the
connection fails, the Trigger remains in the Draft: inspect or run
`oo flow trigger list <flow> --json`, retain the returned
`triggerId`, and retry only the missing `oo flow connect` command. Never rerun
`trigger add` blindly. Use `oo flow trigger set` for later changes.

Configure complex Webhook request and response behavior in Workbench when the
CLI reports that boundary.

## Verify, run, and publish

Perform one authoritative verification after the final mutation:

- Use `oo flow inspect <flow> --summary --json` when the
  result must include structure and the latest Revision.
- Use `oo flow check <flow> --json` when only semantic
  validity is needed.

At the Draft boundary, report the latest Revision, check validity, and any
Connector Nodes that still lack `connectionId`. Do not call both inspect and
check unless the first result lacks a fact required by the request.

For an explicitly requested execution, prove runtime readiness, then run:

```bash
oo flow run <flow> --source draft --wait --json
oo flow runs result <run-id> --json
```

Read `runs result` after terminal success. On failure or `indeterminate`, read
`oo flow runs events <run-id> --json` for diagnostics;
do not fetch the full event stream after every successful Run.

Publish only after the latest Revision is valid and runtime-ready:

```bash
oo flow publish <flow> --json
```

## Opening Workbench

Use `oo flow open [flow]` when the user wants the Workbench opened in their
system browser.

When the user explicitly asks for an agent-hosted in-app browser, run
`oo flow workbench [flow] --json`, read its top-level
`url`, and navigate immediately. The URL contains a short-lived, one-time
browser sign-in code. Never log, cache, persist, share, or attempt to reuse it;
if navigation fails or the URL was consumed, run the command again for a fresh
URL. If the host has no in-app Browser capability, return the fresh URL and
state that it is short-lived instead of claiming the preview was opened.

An already-open Workbench subscribes to Project revision notifications and
updates its Draft after successful `oo flow` mutations. Do not reload, reopen,
or navigate it merely to display a CLI change. Verify writes with CLI output.
Interact with the browser after a write only when the user explicitly requests
it or when diagnosing an observed stale view.

## Failure handling

- On `project.revision-conflict`, inspect the new Draft and recompute the edit.
  Do not drop the expected Revision and overwrite concurrent work.
- On `flow.mutation-outcome-unknown`, inspect before retrying because the write
  may already have been accepted.
- A successful `flow apply --json` response is authoritative even when
  `check.valid` is `false` or `check.status` is `unavailable`: the mutation was
  accepted and the response identifies the new Revision. Do not retry the same
  request. Repair reported diagnostics, or inspect the current Revision when
  the check was unavailable.
- Stop on missing Connector or Trigger authorization at the requested Run or
  Publish boundary and report the direct connection or re-authorization
  action. Do not replace a Flow Node with a direct third-party API call.
