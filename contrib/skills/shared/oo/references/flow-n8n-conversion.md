# Convert n8n Workflows to Open Flow

Treat n8n workflow or template JSON as a behavioral specification. Rebuild the
behavior from current Open Flow contracts instead of renaming node types or
copying n8n parameters mechanically. Read
[flow-authoring.md](flow-authoring.md) for the authoritative `oo flow` command
and mutation contract.

## Contents

- [Boundary](#boundary)
- [Conversion workflow](#conversion-workflow)
- [Inventory](#inventory)
- [Expression rewrites](#expression-rewrites)
- [Cardinality and branches](#cardinality-and-branches)
- [Node family mapping](#node-family-mapping)
- [Blocker decisions](#blocker-decisions)
- [Conversion report](#conversion-report)

## Boundary

- Default to a saved and checked Draft.
- Never Run or Publish unless the user explicitly asks for that additional
  boundary after reviewing the conversion.
- Never persist n8n credential IDs, credential names, webhook IDs, instance
  URLs, execution metadata, or pinned package versions.
- Before mutation, inspect node parameters, headers, query values, request
  bodies, expressions, and Code source for embedded credentials or secrets.
  Map provider credentials to a Connection and use another sensitive value only
  through a binding proven by the current Open Flow contract. Never copy it
  into an apply spec or generated Code. Classify an unresolved sensitive value
  as `needs-input` and do not mutate the Draft.
- Never call a third-party API directly to replace a missing Open Flow
  Connector or Trigger.
- Do not mutate a Flow until every required source behavior has a disposition.

## Conversion Workflow

1. Obtain and parse one n8n workflow object. Reject malformed JSON, missing or
   malformed `nodes` or `connections`, duplicate names that collide with an
   enabled node, and connections to missing nodes. Treat annotations as
   non-executable. Record disabled nodes as intentionally omitted.
2. Account for every enabled executable node and every connection. Collapse
   model, parser, tool, memory, and retriever nodes joined by specialized n8n
   edges into semantic clusters before choosing replacements.
3. Resolve the target Project without changing the saved Project selection.
   Discover exact provider Trigger and Connector contracts through Flow-scoped
   `oo flow` commands. Search by provider plus business operation, inspect the
   selected contract, and retry one precise query before declaring a catalog
   miss.
4. Prefer Trigger for webhook, schedule, and provider events; Connector for
   external reads and side effects; LLM for standard chat or structured
   generation; Code for record shaping, collection processing, explicit joins,
   and expression reconstruction; and Condition only for simple branches whose
   predicate and output behavior can be preserved.
5. Classify each node or semantic cluster as `converted`, `needs-input`,
   `capability-missing`, or `unsupported` using the rules below. Stop before
   mutation if any required behavior is `capability-missing` or `unsupported`.
6. Generate JavaScript ESM modules for Code nodes and one version-1
   `oo flow apply` request. Use explicit Code ports, literal Connector and LLM
   inputs, all reconstructed Edges, and the expected Revision when editing an
   existing Draft.
7. Apply once, then perform one authoritative `oo flow check` or summary
   inspection. A valid graph is not proof of behavioral equivalence; verify
   branch meaning, cardinality, data references, and side effects separately.

## Inventory

Retain for each enabled node:

- name, type, resource, operation, and credential service;
- trigger schedule, filter, delivery semantics, and payload dependencies;
- external reads and side effects;
- incoming and outgoing main branch indexes;
- specialized edge types such as `ai_languageModel`, `ai_outputParser`,
  `ai_tool`, `ai_memory`, and `ai_retriever`;
- every expression and Code source field;
- node execution settings, including `executeOnce`, `alwaysOutputData`,
  `retryOnFail`, retry limits and delays, `onError`, and `continueOnFail`, plus
  the workflow-level error handler;
- item cardinality entering and leaving Merge, Split, Aggregate, Code, and
  provider nodes.

Treat Sticky Notes and other annotations as non-executable. Report disabled
nodes but do not convert them unless the user asks to restore their behavior.
Do not derive conversion risks from disabled nodes. Inspect an
enabled-to-disabled dependency before rewiring because disabled-node
pass-through behavior may still affect the executable path.

## Expression Rewrites

Translate expressions by meaning:

- `$json.path`: read an explicit current-record input.
- `$('Node').item.json.path` and `$node['Node'].json.path`: create an Edge from
  that upstream node into a named Code input. Preserve `.item` only when a
  one-to-one relation is proven.
- `$('Node').first()`, `.last()`, `.all()`, and `$items('Node')`: expose an array
  explicitly and implement ordering and empty-collection behavior in Code.
- `$binary`: inspect the selected Trigger or Connector attachment or artifact
  contract. Open Flow has no implicit n8n binary store.
- `$env`: request an explicit non-secret value or supported binding. Never copy
  an environment value from the export.
- `$now` and `$today`: use ordinary JavaScript only when execution-time clock
  semantics are sufficient.
- `$execution`, `$workflow`, `$runIndex`, and other n8n runtime metadata:
  replace only when an equivalent explicit Open Flow input exists.

Rewrite n8n Code and Function nodes as standard JavaScript ESM. Remove `$input`,
`items`, `$json`, `$binary`, n8n helpers, implicit item wrappers, and arbitrary
module loading. Export a function that receives one input record and returns
the declared output record.

## Cardinality and Branches

n8n commonly invokes a node once per item and tracks paired-item lineage. Open
Flow invokes a Task with one input record. Represent collections with arrays and
use Code for `map`, `filter`, grouping, sorting, aggregation, or keyed joins.

Do not translate paired-item access into the first available item. If the
one-to-one relation cannot be proven or rebuilt with explicit keys, classify the
required behavior as `unsupported` for automatic conversion.

Preserve branch indexes. `main[0]` and `main[1]` often represent true and false
or separate Switch cases. They are not duplicate connections.

An Open Flow Condition emits its input value on the selected output. When a
guarded downstream node also needs other upstream values, join the Condition
output and those values in a Code node. The Code node becomes a branch gate and
does not run when that branch produces no value. Do not connect unguarded data
directly to a side-effect node.

For Merge, prove mode, join keys, ordering, duplicate behavior, and empty-side
behavior. Use Code only when these are explicit and bounded.

### Node Execution Settings

Preserve node settings by their observable behavior, not their labels:

- `executeOnce` changes which input items are consumed. Reproduce the exact
  first-item and empty-input behavior with explicit collection handling.
- `alwaysOutputData` changes item cardinality and whether downstream branches
  activate when a node produces no data. Do not treat an absent output as an
  empty record.

Treat `retryOnFail`, `onError`, `continueOnFail`, and workflow-level error
handling as one failure contract:

- Retries happen before terminal error routing. Preserve attempt limits, delays,
  and the fact that a retry can repeat an external side effect; only an
  exhausted failure reaches the selected error path.
- Legacy `continueOnFail` can place an error item on the regular output, and
  `onError: "continueRegularOutput"` also continues through the regular output.
  Do not assume that `onError: "continueErrorOutput"` sends every failure to the
  error output: n8n can split returned error items in `handleNodeErrorOutput`,
  while a thrown whole-node failure can pass input through the regular output.
  For the specific node and `typeVersion`, inventory which failure forms are
  reachable and prove each path separately. Preserve exact output indexes,
  payloads, and cardinality; if either reachable path is unproven, classify the
  mapping as `unsupported`.
- When an export contains both legacy `continueOnFail` and modern `onError`, do
  not guess precedence. Prove the effective behavior for that n8n version and
  node implementation because execution paths may interpret the combination
  differently.
- Preserve whether a handled node error lets the workflow finish successfully
  or an unhandled error fails the workflow and invokes its configured
  workflow-level error handler.

If the combined failure contract cannot be preserved by a proven Flow contract
or an explicit bounded redesign, classify the behavior as `unsupported`. It is
an execution-model mismatch, not a missing Connector or Trigger capability.

## Node Family Mapping

### Trigger

- Map n8n Webhook to an Open Flow webhook Trigger only when request and response
  behavior fit the current contract.
- Map Schedule and Cron from the actual expression and timezone, not the node's
  display name.
- Prefer an exact provider polling Trigger over Cron plus a list action because
  the Trigger owns cursor and deduplication behavior.
- Inspect the Trigger payload. If n8n exposed richer data, add a Connector read
  using an event ID instead of assuming hidden fields exist.

### Connector

Match by provider and business operation, then inspect the exact input and
output handles. Separate read, create, update, reply, label, upload, and download
operations even when n8n exposes them through one configurable node.

Use only schema-declared inputs and outputs. Do not carry n8n credential IDs into
the Draft. A known Connector may omit its Connection in a Draft when supported,
but must have an active Connection before Run or Publish.

### LLM

Collapse a standard prompt, model, and structured parser cluster into
`llm-chat` or `llm-json` when its semantics fit. Configure only the fixed
`messages`, `input`, `template`, and `model` inputs. Do not copy a provider model
ID unless it is known to be supported by Open Flow.

Use the fixed `output` port for results. For structured output, declare its JSON
Schema and add a Code validator when downstream branching or side effects depend
on exact fields. A port schema alone does not reproduce every n8n parser retry or
repair policy.

Treat agents, tools, memory, retrievers, vector stores, and specialized
LangChain edges as one semantic cluster. Do not turn `ai_tool`, `ai_memory`, or
`ai_retriever` into ordinary data Edges.

### Code and Transform

Use Code with explicit input/output records for Set/Edit Fields, Split Out,
Aggregate, Sort, Limit, deduplication, simple Merge, and expression shaping.
Prefer direct Connector-to-Connector Edges when no shaping is required.

Use Condition for simple IF/Switch predicates only when first-match, default,
and branch output behavior are preserved. Otherwise use an explicit Code design
or stop.

### Stateful Interaction

Wait, resume, form interaction, human approval, `sendAndWait`, webhook response,
and conversation memory may span executions or own an external response
lifecycle. An ordinary Code node is not a durable substitute. If current Open
Flow contracts do not expose the required lifecycle, classify the behavior as
`unsupported` and stop.

## Blocker Decisions

Use these dispositions:

- `converted`: a proven Open Flow contract preserves the behavior.
- `needs-input`: conversion is possible after the user supplies a business
  value or Connection. Proceed at Draft boundary only when it may legally
  remain unresolved.
- `capability-missing`: Open Flow can express the behavior, but the current
  Connector or Trigger catalog lacks the exact provider event or operation.
- `unsupported`: a required n8n behavior cannot be implemented faithfully by
  the Open Flow execution model or an explicit redesign with current
  primitives. Do not suggest that Code is equivalent.

Before declaring `capability-missing`, search by provider and business
operation, inspect the best candidate, retry one exact provider-qualified query,
and use the full provider catalog only when ambiguity remains. Finish the
offline graph plan far enough to define the missing contract, but do not create
a partial Draft. Report:

```text
Status: capability-missing
Provider: <service>
Capability: Trigger | Connector
Operation/event: <business behavior>
Required inputs: <names and meanings>
Expected outputs: <names and meanings>
Reason required: <source nodes and downstream consumers>
Request: https://oomol.com/support/
```

Use `unsupported` when the mismatch belongs to execution semantics, implicit
lineage, an external response lifecycle, or durable state. A conclusive required
mismatch stops mutation, not analysis: continue the offline inventory, contract
discovery, and classification until every enabled node and Edge has a
disposition, then report every blocker without creating a partial Draft. Do not
redirect a fundamental incompatibility as a provider catalog request.

Keep catalog absence separate from authentication. An unavailable action is a
product capability gap; an existing action without an active Connection is
`needs-input` at Draft boundary or a runtime-readiness blocker.

## Conversion Report

Before mutation, present a compact table containing every enabled source node
or semantic cluster, its Open Flow replacement, status, and important semantic
notes. Include every source Edge in the graph plan, including branch indexes and
specialized edges collapsed into a cluster.

After a successful Draft write, report:

- Project, Flow, and Revision IDs;
- authoritative check result;
- Trigger and Connector contracts selected;
- Connections selected or still missing;
- annotations and disabled nodes omitted;
- known behavioral differences that do not invalidate the requested outcome.
