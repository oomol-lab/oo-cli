# Connector Execution

Read this file only after selecting a connector-backed candidate.

This page inherits the constitution from `SKILL.md`: connector schema is the
only source of service names, action names, input fields, output fields, and
artifact semantics.

## Goal

Turn a connector candidate into a callable connector contract, then send the
smallest sufficient JSON payload that matches the user's real intent.

## Confirm the action contract

- Use the chosen search result's `service` and `name` as the starting point.
- Run `oo connector schema "<service>" --action "<name>"` before
  building any payload.
- Use the returned exact `service`, `name`, `description`, `inputSchema`, and
  `outputSchema` to confirm the action fit.
- Prefer the action whose description most directly matches the user's desired
  outcome, especially when the user named the target service.
- If the selected schema directly satisfies the outcome and required inputs are
  available, build the payload and execute; do not rediscover adjacent actions.
- If schema evidence does not prove the action can satisfy the user outcome,
  refine discovery or stop with a catalog miss.

Representative schema command:

```bash
oo connector schema "gmail" --action "send_mail"
```

Representative schema JSON shape:

```json
{
  "description": "Send a Gmail message.",
  "inputSchema": {},
  "name": "send_mail",
  "outputSchema": {},
  "service": "gmail"
}
```

## Build connector payload

- Use the returned `inputSchema` and normal JSON Schema required-field
  semantics.
- Use only declared input fields.
- Prefer concrete user values over placeholders, broad guesses, or defaults.
- Preserve service-specific constraints such as recipient, folder, file id,
  time range, calendar, channel, label, format, or destination.
- If an input can accept a URI and the user only has a local file, read
  [file-transfer.md](file-transfer.md) before executing.
- If the task depends on raw file bytes, local paths, or unsupported
  special-media handles that cannot be submitted safely through normal JSON,
  stop the current `oo` path.

## External side effects

Actions that send, post, invite, update, delete, move, share, or otherwise
change third-party state need high confidence before execution.

Proceed directly only when the user's intent and all required payload values are
unambiguous. Otherwise ask one focused question or confirmation. Do not use
`--dry-run` as a substitute for completing an explicitly requested action, but
honor user requests to validate without executing.

An explicit user instruction plus complete required payload values is sufficient
confidence for non-destructive send, post, create, or invite actions. Ask before
destructive actions, broad sharing, or ambiguous recipient, content, or
destination choices.

## Execute the connector path

Canonical form:

```bash
oo connector run "<serviceName>" \
  --action "<actionName>" \
  --data '<json object>' \
  --json
```

Facts:

- `serviceName` is the only positional argument.
- `--action` is required and selects the connector action name.
- `--data` must be a JSON object string or `@path/to/file.json`.
- If `--data` is omitted, the CLI uses `{}`.
- `--json` returns a stable JSON object for execution output.
- In execution responses, the execution id is nested under
  `meta.executionId`, not a top-level field.

Expected execution JSON:

```json
{
  "data": {},
  "meta": {
    "executionId": "execution-id"
  }
}
```

## Read current response shapes defensively

Connector providers can expose the same operational value under different
field names. Until the selected schema or CLI output proves a single canonical
field, read common response fields defensively and keep the raw response file
for debugging.

Common accessors:

```bash
jq -r '.task.id // .data.sessionId // .data.sessionID // .data.taskId // .data.taskID // .sessionId // .sessionID // .taskId // .taskID // empty' run.json
jq -r '.state // .data.state // .task.state // empty' state.json
jq '.result // .data.result // .data.data // .data // .' result.json
```

Rules:

- Prefer `task.id` when present, but support provider-specific task id fields
  such as `sessionId`, `sessionID`, `taskId`, and `taskID`.
- Prefer the selected schema's documented result field over generic fallback
  accessors.
- Do not discard a successful partial response just because an optional
  convenience field is absent.

## Long-running connector actions

Some connectors expose submit, state, and result actions instead of a single
synchronous action. Treat that pattern as a resumable task lifecycle.

Rules:

- Submit exactly once for the same logical work item.
- Immediately save the submit response and extracted task id in a checkpoint
  file before polling.
- Poll the state action with the saved task id; do not resubmit after a timeout
  or interrupted wait.
- Treat states such as `queued`, `pending`, `processing`, and `running` as
  non-terminal.
- Treat `completed`, `complete`, `succeeded`, or `success` as terminal success,
  then call the result action.
- Treat `failed`, `error`, and `canceled` as terminal failure and
  report the provider error without creating a replacement task unless the
  user asks to retry with changed inputs.
- If state is still processing and provider progress is `0`, treat progress as
  unavailable, not as failure.
- On timeout, report the saved task id and the exact checkpoint file or resume
  command needed to continue polling.

## Interpret outputs by schema semantics

- Interpret connector output fields by their documented meaning, not by URL
  shape alone.
- If an output field is documented as a download URL, read
  [file-transfer.md](file-transfer.md) before saving it locally.
- Treat browse metadata such as `webViewLink`, edit URLs, folder URLs, or
  console URLs as non-downloadable unless the schema or action description says
  they return file content.
- If only metadata came back, report metadata as metadata. Do not synthesize a
  download URL.

## Storage-style connectors

Storage connectors such as Google Drive, Dropbox, and OneDrive often separate
locating a file from materializing its bytes.

State model:

1. Locate
   Use a `find_*`, `list_*`, or similarly described action when the user needs
   to identify a file or folder. Treat the result as metadata.
2. Select
   If the locate action returns multiple candidates and the user's target is
   ambiguous, ask one focused question. If the locator clearly identifies one
   item, use its stable id or documented locator field.
3. Materialize
   Discover or choose an action whose description identifies it as download or
   export and whose `outputSchema` exposes a download URL field, such as
   `transitUrl` on `googledrive.download_file`.
   Prefer refining within the same connector service first, using the selected
   service as a keyword or constraint.
4. Save
   Feed that documented download URL to `oo file download`. Do not feed
   `webViewLink`, edit URLs, folder URLs, or console URLs to file download.

If the same connector offers several find-style actions, prefer the one whose
filters match the user's locator by name, id, folder, type, or time range so
the result is as narrow as possible.

## Re-authorization branches

Inspect `errorCode` before broader troubleshooting:

- `scope_missing`: explain that the connector authorization is missing the
  required scope and must be re-authorized
- `credential_expired`: explain that the connector authorization has expired
  and must be re-authorized
- `app_not_ready` / `app_not_found`: explain that the connector has not been
  authorized yet and must be authorized before retrying

For those cases, guide the user to:

```text
https://console.oomol.com/app-connections?provider=${serviceName}
```

Replace `${serviceName}` with the selected connector service.

## Known connector caveats

- Unknown input handles, missing required values, wrong types, or non-object
  `--data` payloads are rejected.
- If an input schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.
