# oo CLI Contract

This reference captures the concrete `oo-cli` contract that the skill may rely
on. Use it when you need exact command syntax, JSON expectations, auth behavior,
or known stop conditions.

## Entrypoints

Canonical entrypoint:

```bash
oo --lang en ...
```

If `oo` is unavailable, stop.

## Authentication

- `search`, `package info`, `cloud-task run`, `cloud-task result`, and
  `cloud-task wait` all require a current authenticated account.
- If auth state is uncertain, use:

```bash
oo --lang en auth status
```

- Treat auth as usable only when the output confirms a valid active account.
- If auth status reports logged out, missing, invalid, or request failed, stop
  before any remote command.
- If the user needs to repair auth, ask them to complete:

```bash
oo --lang en auth login
```

## `search`

Canonical form:

```bash
oo --lang en search "<text>" --json
```

Facts:

- `<text>` is the only positional argument.
- `--json` is an alias for `--format=json`.
- JSON output is a raw array, not an object with a top-level `packages` field.
- Search text longer than `200` characters is truncated before the request is
  sent.
- There is no client-side top-k or limit flag.
- Do not use `--only-package-id` when choosing candidate blocks.

Representative JSON example:

```json
[
  {
    "blocks": [
      {
        "title": "string"
      }
    ],
    "displayName": "string",
    "name": "string",
    "version": "1.2.3"
  }
]
```

Treat the array items as loosely shaped service data. Useful fields may be
missing, sparse, or added over time.

Stop condition:

- If the array is empty, stop and tell the user that `oo` does not currently
  have a matching capability.

## `package info`

Canonical form:

```bash
oo --lang en package info "<packageSpecifier>" --json
```

Supported package specifier examples:

- `pdf`
- `pdf@1.0.0`
- `@foo/epub`
- `@foo/epub@1.0.0`

Facts:

- If no version is provided, the CLI resolves the latest version.
- `@latest` is valid for `package info`, but not for `cloud-task run`.
- For execution later, always use the resolved `packageVersion`.
- Use `blocks[].blockName` for `--block-id`.
- Do not confuse block `title` with `blockName`.

Expected JSON shape:

```json
{
  "blocks": [
    {
      "blockName": "main",
      "description": "string",
      "inputHandle": {
        "inputName": {
          "description": "string",
          "nullable": false,
          "schema": {
            "type": "string"
          },
          "value": "optional default value"
        }
      },
      "outputHandle": {
        "outputName": {
          "description": "string",
          "schema": {
            "type": "string"
          }
        }
      },
      "title": "Main"
    }
  ],
  "description": "string",
  "displayName": "Readable package title",
  "packageName": "package-name",
  "packageVersion": "1.2.3"
}
```

Treat an input handle as optional only when metadata proves it:

- `value` exists and is not `null`
- `nullable` is `true` and `value` is `null`
- `schema.default` exists

These signals only show that omission may pass local validation.

They do not prove that the package-provided value is correct for the current
user request.

Sample values, placeholders, empty strings, and defaults should be overridden
whenever the user request implies a specific input.

## `cloud-task run`

Canonical form:

```bash
oo --lang en cloud-task run "<packageName>@<version>" \
  --block-id "<blockName>" \
  --data '<json object>' \
  --json
```

Dry-run form:

```bash
oo --lang en cloud-task run "<packageName>@<version>" \
  --block-id "<blockName>" \
  --data '<json object>' \
  --dry-run \
  --json
```

Facts:

- The package specifier must contain an explicit semver version.
- `@latest` is not valid for `cloud-task run`.
- `--block-id` is required.
- `--data` must be a JSON object string or `@path/to/file.json`.
- If `--data` is omitted, the CLI uses `{}`.
- Local validation runs before task creation.

Expected success JSON:

```json
{
  "taskID": "task-id"
}
```

Expected dry-run JSON:

```json
{
  "dryRun": true,
  "ok": true
}
```

Hard validation limits:

- Unknown input handles are rejected.
- Missing required values are rejected.
- Type mismatches are rejected.
- `--data` must decode to a plain JSON object.
- If an input handle schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.

Practical implication:

- Stop instead of pretending that file, image, or other special-media handles
  can be submitted safely through normal JSON payloads.

## `cloud-task result`

Canonical form:

```bash
oo --lang en cloud-task result "<taskId>" --json
```

Possible JSON shapes:

```json
{
  "progress": 0.5,
  "status": "queued"
}
```

```json
{
  "resultData": {},
  "resultURL": null,
  "status": "success"
}
```

```json
{
  "error": "message",
  "status": "failed"
}
```

In-progress statuses include `queued`, `scheduling`, `scheduled`, and
`running`. Treat any of them as not terminal yet.

Use this command after a non-zero `cloud-task wait` exit to distinguish timeout,
failure, and a late success.

## `cloud-task wait`

Canonical form:

```bash
oo --lang en cloud-task wait "<taskId>" --timeout "<window>"
```

Facts:

- `cloud-task wait` does not support `--json`.
- It polls every `3` seconds.
- Default timeout is `6h`.
- Minimum timeout is `10s`.
- Maximum timeout is `24h`.
- Supported timeout formats include `1m`, `4h`, `120s`, and `360`.
- Success exits with code `0` and prints text output.
- Failed tasks print a result snapshot and then exit non-zero.
- Timeout also exits non-zero.
- While the task is still running, the CLI prints periodic status snapshots.

Skill policy:

- Prefer bounded wait windows over a single long wait.
- Do not treat timeout as task failure.
- Never re-create a task just because a wait window ended.

## Command selection summary

Use this order:

1. Convert the user request into `2` to `6` English keywords.
2. Run `search --json`.
3. Run `package info --json` for the serious candidates.
4. Choose one primary package and optionally one fallback.
5. Ask focused follow-up questions only for missing required inputs.
6. Run `cloud-task run --json`.
7. Share `taskID` immediately.
8. Use bounded `cloud-task wait` windows when appropriate.
9. After a non-zero wait exit, run `cloud-task result --json`.
