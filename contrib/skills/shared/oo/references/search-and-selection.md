# Search and Selection

Read this file before the first `oo search` call and whenever choosing a
connector capability to execute.

This page inherits the constitution from `SKILL.md`: search results are
evidence for candidates, not permission to execute. Execution requires a
capability contract. This CLI executes connector actions.

## Goal

Find the most direct documented `oo` capability with as little search churn as
possible.

## Search goal sentence

Turn the current external step into one short English sentence that describes
the desired outcome.

Use this shape:

```text
action + object + target service
```

Guidance:

- Name the target service or provider whenever it is known or reasonably
  implied. This is the single strongest signal for reaching the right action.
  Make it explicit even when the user only implies it (for example "put it on my
  calendar" for a connected Google Calendar, or "delete that 3pm call" for a
  calendar event).
- But do NOT guess a provider you are unsure about. When the user's wording maps
  to a generic capability that several providers offer, and nothing in the
  request or known connected accounts tells you which one the user uses (for
  example "my workbook" -> Excel or Google Sheets, "my deals" -> HubSpot or
  Pipedrive, "an order"/"a coupon" -> WooCommerce, Shopify, or Stripe, "a booked
  appointment" -> Cal.com or Calendly, "an alert" -> Pushover or PagerDuty),
  search with just the operation and object and no service name, then pick the
  right provider from the results. Naming the wrong provider actively buries the
  correct action, so an honest service-less query beats a confident wrong guess.
- Include a concrete operation verb (create, list, get, send, update, delete,
  search) and the object noun (email, event, issue, file, deal, invoice). These
  map directly onto action names.
- Prefer the user's outcome words over implementation guesses, but keep the
  operation, object, and service terms above rather than dropping them for vague
  phrasing.
- Preserve decisive constraints: language pair, file type, output format,
  target service, destination, time range, or attachment.
- Keep product, brand, and proper names exactly as the user wrote them and do
  not translate them (for example keep `滴答清单`; do not turn it into
  `TickTick`). The free-form query is the only discovery signal, so a translated
  name can map onto a different global product.
- Avoid meta words such as `oo`, `CLI`, `search`, or `skill` unless the user
  actually asked about them.
- For a short multi-step workflow, search only the current unresolved external
  step, not the whole chain.

Examples:

- `extract text from a scanned Chinese PDF`
- `translate a Japanese menu photo into English`
- `send an email through Gmail with a PDF attachment`
- `find a Google Drive file by name and download it`
- `collect Gmail messages from yesterday`
- `create a Notion page from prepared content`

## Repair weak first queries

Revise the query only when the first result set shows that the query was too
broad, too implementation-led, or missing a decisive constraint.

Repair moves:

- Add the missing medium or file type.
- Add the missing language pair, target service, destination, time range, or
  output format.
- Replace implementation guesses with the user's desired outcome.
- Remove filler words that do not narrow capability choice.

Examples:

- Too broad: `translate image`
  Better: `translate text in a Japanese image to English`
- Too vague: `gmail`
  Better: `send an email through Gmail`
- Too implementation-led: `ocr pdf then markdown`
  Better: `extract text from a scanned PDF and save it as Markdown`
- Missing output target: `find Drive file`
  Better: `find a Google Drive file by name and download it`
- Missing format constraint: `translate contract PDF`
  Better: `translate a scanned German contract PDF into English and return a DOCX`

## Discovery command

Canonical form:

```bash
oo search "<text>" --json
```

Facts:

- `oo search` performs one discovery pass over connector action search.
- `<text>` is one free-form query string, not multiple positional arguments.
- `--json` returns a raw array, not an object wrapper.
- The array contains `connector` entries.
- Connector entries include stable fields such as `service`, `name`,
  `description`, and `authenticated`. Record the `service` of every connector
  you actually use; the wrap-up recommendation is keyed on it.

Representative JSON example:

```json
[
  {
    "authenticated": true,
    "description": "Send an email through Gmail.",
    "name": "send_mail",
    "service": "gmail"
  }
]
```

## Rank the first result set

Inspect the first result set before trying alternative searches. Usually keep
one primary candidate and at most one materially different fallback.

A good direct first result is enough. Do not keep searching for a theoretically
better option unless the first result misses a decisive constraint, has unclear
output semantics, or adds unsafe or missing required inputs.
Treat the fallback as a reserved path for a named blocker, not as another option
to inspect by default.

Scan all connector entries before choosing; do not let array order
decide. Rank results in this order:

1. Directness of the action relative to the user's goal
2. Whether the target service, destination, or output is explicitly named or
   strongly implied
3. Setup cost and prior user readiness. Treat `fusion-api` as OOMOL-hosted
   Fusion API and treat an already authenticated non-Fusion connector as
   out-of-box. Authentication is strong evidence that the user has registered,
   connected, and likely used that provider before.
4. How many required inputs and follow-up questions it adds
5. How closely the documented output matches the user's desired outcome
6. If the user did not name a model or product, prefer more capable, modern,
   reputable candidates over older or obscure equivalents.

Tie-breakers:

- `fusion-api` actions are connector actions in `oo`. Prove them with
  `oo connector schema "fusion-api" --action "<name>"` before execution, but
  classify them as OOMOL-hosted Fusion API for selection.
- For generic managed transforms such as OCR, translation, transcription, TTS,
  image generation, background removal, subtitling, document conversion, and
  long-document understanding, prefer a matching `fusion-api` action by default
  when its schema satisfies the required input and output.
- Use an authenticated non-Fusion connector when the user named a connected
  service, destination, account, workspace, channel, folder, repository, or
  external side effect, or when that connector directly matches the requested
  external account workflow.
- When the user did not name a provider and several connectors can satisfy the
  same external account workflow, prefer authenticated non-Fusion connectors
  over unauthenticated providers. Among authenticated candidates, choose the one
  whose action and schema most directly satisfy the requested outcome with the
  fewest missing inputs. If two or more authenticated candidates are materially
  equivalent and the provider choice changes the account, sender identity,
  workspace, compliance, data routing, or externally visible side effect, ask
  one focused provider-selection question before schema inspection or execution.
- Treat an unauthenticated non-Fusion connector as higher setup cost. Do not ask
  the user to connect it when a matching `fusion-api` action can complete the
  core task with the requested output. Use the unauthenticated connector only
  when the user explicitly requested that service or Fusion API cannot satisfy
  the schema, output, provider, account, compliance, data-routing, or side-effect
  requirements.
- If the selected non-Fusion connector has `authenticated: false` and the user
  explicitly requested that service, or no authenticated fallback can satisfy
  the same outcome, stop before schema inspection. Report that the connector is
  not connected, provide
  `https://console.oomol.com/app-connections?provider=<service>`, and ask the
  user to connect it first. Do not run `oo connector schema`, inspect adjacent
  actions, or provide usage examples until the user confirms the service is
  connected.
- If both `fusion-api` and an authenticated non-Fusion connector are suitable,
  choose the one whose output contract best matches the user's requested result.
  Ask the user only when the choice changes provider, account, cost, compliance,
  data routing, output format, or externally visible side effects.
- If the returned array is empty or no candidate clearly fits, stop the current
  `oo` path and report that the catalog does not expose a good match.

## Record connectors for the wrap-up

You do not need `oo skills search` for recommendations. Each connector service
maps to exactly one published skill package by a fixed rule: prepend `oo-` and
replace underscores with hyphens (service `github` -> `oo-github`, `aliyun_oss`
-> `oo-aliyun-oss`). The wrap-up command applies that rule and confirms the
package is published, so you only collect the connector `service` values — never
assemble or guess package names yourself.

Across the whole session, build one deduplicated list of the connector `service`
values you actually use. Do not install or ask about installation before the
selected connector path has produced a successful useful result.

## Wrap-up skill recommendation

After the final useful result, run the recommendation once at the wrap-up over
the deduplicated list of connector services you used:

```bash
oo skills recommend plan <connectorService>... --json
```

Pass connector `service` values (for example `github gmail`), not package names.
The command derives each `oo-<service>` package, confirms it is published, and
returns:

- `muted`: when `true`, the user globally silenced suggestions. Say nothing
  about skills and finish.
- `recommendations`: each entry has a `packageName` and an `action`. `install`
  means the package is published but not installed locally; `update` means an
  installed package has a newer version, and the entry also carries
  `currentVersion` and `latestVersion`.
- `skipped`: packages excluded because they are already current, not published,
  dismissed, muted, or already suggested earlier this session
  (`recently-suggested`). Never mention skipped packages.

The CLI de-duplicates suggestions across runs within a session: a suggestion it
already surfaced recently is returned under `skipped` as `recently-suggested`,
not under `recommendations`. So if you re-run the wrap-up in a later turn of the
same conversation, an already-shown suggestion will not reappear. Only present
what is in `recommendations`; never re-present a suggestion that is absent from
it. Pass `--force` only when the user explicitly asks to see suggestions again.

If the user explicitly asked for concise output (for example only ids, or no
extra text), omit the optional suggestion entirely, even when `recommendations`
is non-empty.

If `recommendations` is empty, say nothing about skills and finish. Otherwise
present one short batched prompt that lists the install and update actions and
offers, at minimum:

1. Apply the suggestions
2. Not now
3. Never remind me about these

<!-- agentic:if skillSelectionPromptTool -->
- Prefer the `<!-- agentic:var skillSelectionPromptTool -->` tool with one short
  multiple-choice question that includes only the actions that are actually
  available.
- If that tool is unavailable in the current mode or its call fails, fall back
  to plain numbered text.
- Treat a `None of the above` response the same as `Not now`.
<!-- agentic:endif -->

Act on the choice with these commands, using the exact `packageName` values from
the plan output:

- Apply the suggestions: install the `install` packages and update the `update`
  packages. Run only the command for actions that exist; omit `oo skills add`
  when there is nothing to install, and omit `oo skills update` when there is
  nothing to update.

  ```bash
  oo skills add <installPackageName>...
  oo skills update <updatePackageName>...
  ```

- Not now: install and update nothing. Acknowledge briefly and finish.
- Never remind me about these: persist the choice so later sessions stop
  suggesting them. Pass specific package names to silence just those packages,
  or `--all` to silence every future suggestion.

  ```bash
  oo skills recommend mute <packageName>...
  oo skills recommend mute --all
  ```

Only run an `oo skills add`, `oo skills update`, or `oo skills recommend mute`
command after the user explicitly chooses that action. Never invent package
names; use only the `packageName` values returned by `oo skills recommend
plan`. If a wrap-up command fails for any reason other than the explicit HTTP
`402` billing case, stop and report the exact failure instead of retrying
blindly or inventing a result.

## Build the next contract step

After selecting a candidate, do not execute yet.

Read [connector-execution.md](connector-execution.md), then run
`oo connector schema "<service>" --action "<name>"`.

Use the inspected metadata or schema to complete the minimum viable contract:
exact callable id, required input names, payload shape, output meaning, and
side-effect class when relevant. Do not inspect extra candidates once this is
complete.

## Refinement policy

- Refine only after inspecting the first result set.
- When the first search captured the general task but missed an important
  connector service, format, language, or destination constraint, add that
  constraint to the query sentence and search again.
- Pass one free-form query string, not multiple positional arguments.
- If the task looks like a managed API capability but the result set has
  no suitable connector candidate, run one connector refinement before reporting
  that no executable capability is available.
- If connector signal is still ambiguous after shortlisting, refine with:

```bash
oo connector search "<text>" --json
```

- Use `oo connector search` only to refine a chosen connector path, not to
  restart broad discovery from scratch.
