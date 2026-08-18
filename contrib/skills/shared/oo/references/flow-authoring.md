# Open Flow authoring

Use this mode for persistent Cloud workflows. Use `--json` for every command
whose output feeds another step. Put `oo` global options such as `--lang` and
`--debug` before `flow`.

## Contents

- [Authoring sequence](#authoring-sequence)
- [Atomic graph creation](#atomic-graph-creation)
- [Port compatibility](#port-compatibility)
- [Triggers](#triggers)
- [Opening Workbench](#opening-workbench)
- [Verification and failure handling](#verification-and-failure-handling)

## Authoring sequence

1. Resolve the Project with `oo flow project list --json`. Prefer explicit
   `--project <project-id>` on each command. Use `oo flow project use` only when
   the user wants to change the saved default.
2. Locate the Flow with `oo flow list --project <project-id> --json`. Create a
   missing Flow with `oo flow create <name> --project <project-id> --json` only
   when the user asked for creation.
3. Before editing an existing Flow, run
   `oo flow inspect <flow> --project <project-id> --json`. Treat its Revision,
   Node IDs, handles, Triggers, and check result as authoritative.
4. Discover Connector Nodes with
   `oo flow connector search <query> --project <project-id> --json`, then inspect
   the selected action with
   `oo flow connector show <action> --project <project-id> --json`.
   Never substitute `oo search`, `oo connector schema`, or `oo connector run`.
   Search returns ranked matches, not an exhaustive catalog or connection
   status. A missing provider or action in one result is not evidence that it
   is unavailable or unauthorized. Retry once with a provider-qualified,
   action-shaped query, and use `oo flow connector list --json` if its existence
   remains uncertain.
5. Build the smallest complete Draft mutation. Prefer one `oo flow apply` for a
   new multi-Node graph; use individual Node commands for isolated edits.
6. Add Triggers separately, connect their `payload`, then inspect or check the
   resulting Flow. Run or publish only when the user requested that boundary.

Do not invent action IDs, Trigger keys, connection IDs, input names, output
names, or config fields. Take them from Flow-scoped search/show output. An
omitted Connector connection or `connection: "default"` selects the active
default when one exists; otherwise treat the connection error as an auth
blocker. Keep action discovery separate from authorization verification. Before
reporting that a known service is not connected, run
`oo flow connector connections <service> --project <project-id> --json`; require
an explicit empty or inactive result, or a connection or authorization error
from the selected action. A search miss alone is never an auth blocker.

`--set field=value` values are JSON. Use `field=@file` for a JSON file or
`field=-` for stdin; use `--set @file` or `--set -` to merge an object.

## Atomic graph creation

`oo flow apply <flow> --file <path|-> [--expected-revision <revision>]
--project <project-id> --json` accepts a version-1 one-shot request:

```json
{
  "version": 1,
  "nodes": {
    "source": {
      "kind": "connector",
      "action": "<discovered-action-id>",
      "connection": "default",
      "inputs": {}
    },
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
    { "source": "source", "output": "<output>", "target": "transform", "input": "<input>" },
    { "source": "transform", "output": "<output>", "target": "destination", "input": "<input>" }
  ]
}
```

References inside this request are local labels, not persistent IDs. `apply`
creates the Nodes, Tasks, CodeModules, bindings, and Edges with one Draft CAS.
It checks the accepted Revision but does not run or publish it. The request is
not a Project export or a persistent local source. If the request itself comes
from stdin, Code source in the same request cannot also use `-`; use `@file` or
inline code instead.

Use `--expected-revision` when the edit was prepared from an earlier `inspect`.
For one isolated change, use `oo flow connector add/set`, `oo flow node
add/set/remove`, `oo flow code edit/set`, or `oo flow connect/disconnect` rather
than wrapping the change in a batch request.

## Port compatibility

Before creating each Edge, compare the exact source output and target input
from `connector show`, `trigger show`, or `inspect`. A concrete output schema
must satisfy the input schema and nullability. Never connect known incompatible
types such as an array output to a string input, even if an older Draft check
accepts the Edge.

An empty schema `{}` is dynamic, not a conversion. Use a dynamic Code Node
between typed ports only when its implementation returns a value accepted by
the destination. For example, convert a message array to text explicitly:

```js
export function run(input) {
  return { result: input.value.map((item) => item.subject).join("\n") };
}
```

Connect the source to the Code Node's `value` input and its `result` output to
the destination. If the required conversion cannot be expressed with a proven
Code Node contract, stop instead of direct-connecting the ports or claiming the
Flow is valid.

## Triggers

Discover provider Triggers with
`oo flow trigger search <query> --project <project-id> --json` and inspect the
exact key with `oo flow trigger show <key> --project <project-id> --json`. Add
it with `oo flow trigger add <flow> <webhook|cron|trigger-key>` plus only
discovered `--connection`, `--set`, `--every`, or `--cron` values. Use
`oo flow trigger set` for later changes.

Triggers are not `apply` Nodes. After adding one, read its returned `triggerId`
and connect `<triggerId> payload` to the exact input of the first Node with
`oo flow connect`. Configure complex Webhook request and response behavior in
Workbench when the CLI reports that boundary.

## Opening Workbench

Use `oo flow open [flow] --project <project-id>` when the user wants the
Workbench opened in their system browser. The command also prints the resolved
Console URL.

When the user explicitly asks to open the Workbench in the Codex App right-side
preview or another agent-hosted in-app browser, run
`oo flow workbench [flow] --project <project-id> --json`, read its top-level
`url`, and navigate the host's in-app Browser to that URL. Do not use
`oo flow open` for an in-app preview because it targets the system browser. If
the host has no in-app Browser capability, return the URL instead of claiming
that the preview was opened.

An already-open Workbench subscribes to Project revision notifications and
updates its Draft after successful `oo flow` mutations. Do not reload, reopen,
or navigate it merely to display a CLI change. Verify writes with `oo flow
inspect` or `oo flow check`. Interact with the browser after a write only when
the user explicitly requests it or when diagnosing an observed stale view;
ambient in-app browser state alone is not permission to control the page.

## Verification and failure handling

- `oo flow inspect` is the preferred read-after-write summary. `oo flow check`
  validates one immutable Revision without executing code or Connectors.
- `oo flow run` can execute external side effects. `oo flow publish` changes
  Live state and can enable automatic Trigger execution. Do neither unless the
  user explicitly requested that effect.
- On `project.revision-conflict`, inspect the new Draft and recompute the edit.
  Do not drop the expected Revision and overwrite concurrent work.
- On `flow.mutation-outcome-unknown`, inspect before retrying because the write
  may already have been accepted.
- On `flow.apply-check-failed`, the mutation was accepted. Do not retry apply;
  run `oo flow check` against the current Flow instead.
- On `flow.invalid` after `apply`, the mutation was accepted but the Draft has
  diagnostics. Do not report success or retry the same request. Inspect the
  current Revision and repair the reported inputs or Edges.
- Stop on missing Connector or Trigger authorization and report the direct
  connection or re-authorization action. Do not replace a Flow Node with a
  direct third-party API call.
