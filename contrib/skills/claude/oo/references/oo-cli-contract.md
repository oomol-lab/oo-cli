# oo CLI Contract

This reference captures the concrete `oo-cli` contract that the skill may rely
on. Use it when you need exact command syntax, JSON expectations, auth behavior,
or known stop conditions.

## Entrypoints

Canonical entrypoint:

```bash
oo ...
```

## Authentication

- `packages search`, `packages info`, `file upload`, `cloud-task run`,
  `cloud-task result`, and `cloud-task wait` all require a current
  authenticated account.
- Do not run `auth status` as a routine precheck.
- If a remote command fails and auth might be the cause, use:

```bash
oo auth status
```

- Treat auth as usable only when the output confirms a valid active account.
- If auth status reports logged out, missing, invalid, or request failed, stop
  before any remote command.
- If the user needs to repair auth, ask them to complete:

```bash
oo auth login
```

## Billing stop conditions

- If any `oo` command output shows HTTP `402` or includes the string
  `OOMOL_INSUFFICIENT_CREDIT`, stop immediately.
- Treat that signal as a billing problem, not as a normal auth failure.
- Tell the user their current account has insufficient credit or is overdue.
- Direct them to recharge before retrying at
  https://console.oomol.com/billing/recharge.

## `packages search`

Canonical form:

```bash
oo packages search "<text>" --json
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

## `packages info`

Canonical form:

```bash
oo packages info "<packageSpecifier>" --json
```

Supported package specifier examples:

- `pdf`
- `pdf@1.0.0`
- `@foo/epub`
- `@foo/epub@1.0.0`

Facts:

- If no version is provided, the CLI resolves the latest version.
- `@latest` is valid for `packages info`, but not for `cloud-task run`.
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

File-oriented practical implication:

- Some file-like handles are safely represented as URI strings instead of raw
  binary payloads.
- Current CLI validation patches `file` widgets to string values with
  `format: "uri"`.
- When the selected handle is URI-compatible and the user only has a local
  file, upload it first with `file upload --json` and use the returned
  `downloadUrl` as the submitted handle value.

## `file upload`

Canonical form:

```bash
oo file upload "<filePath>" --json
```

Facts:

- `<filePath>` is a local file path.
- `--json` is an alias for `--format=json`.
- Successful JSON output includes `downloadUrl`, `expiresAt`, `fileName`,
  `fileSize`, `id`, `status`, and `uploadedAt`.
- The uploaded file expires after one day.
- Files larger than `512 MiB` are rejected.
- Successful uploads persist a local sqlite record.

Practical implication:

- Use this command when a selected `cloud-task run` input can safely accept a
  URI string but the user currently has a local file.
- If the user already provides a remote URL that satisfies the same URI input,
  reuse it instead of re-uploading the file.
- Submit the returned `downloadUrl` in `--data`.
- Do not treat this command as a way to pass raw bytes or bypass unsupported
  `contentMediaType` validation.

## `file download`

Canonical form:

```bash
oo file download "<url>" [outDir] [--name "<name>"] [--ext "<ext>"]
```

Facts:

- `<url>` must use the `http` or `https` scheme.
- `[outDir]` is optional. When omitted, the CLI uses the configured
  `file.download.out_dir` value if present, otherwise `~/Downloads`.
- `[outDir]` and `file.download.out_dir` may start with `~`, which expands to the
  current user's home directory.
- Missing directories are created automatically.
- `--name <name>` overrides only the saved base name. The value must be
  non-empty, must not be `.` or `..`, and must not contain path separators.
- `--ext <ext>` overrides only the saved extension. The value may be written
  with or without a leading `.`, but it must be non-empty, must not be `.`
  or `..`, and must not contain path separators.
- When `--name` or `--ext` is omitted, the CLI infers the saved file name from
  the final response metadata and URL.
- This command does not support `--json` or `--format=json`.
- If the destination path already exists as a file, the command fails.
- If the destination filename collides with an existing file, the CLI renames
  the saved file non-destructively.
- Successful saves print one localized human-readable line on stdout that
  includes the absolute saved path.
- When automating a user-facing artifact download, pass `--name` if the inferred
  file name would otherwise be opaque, such as a UUID, hash, task ID, or a
  generic `download` label. Keep the inferred extension unless the caller has a
  proven better extension.

Failure cases:

- invalid URL
- non-directory `outDir`
- non-success HTTP response

## `cloud-task run`

Canonical form:

```bash
oo cloud-task run "<packageName>@<version>" \
  --block-id "<blockName>" \
  --data '<json object>' \
  --json
```

Facts:

- The package specifier must contain an explicit semver version.
- `@latest` is not valid for `cloud-task run`.
- `--block-id` is required.
- `--data` must be a JSON object string or `@path/to/file.json`.
- If `--data` is omitted, the CLI uses `{}`.
- Local validation runs before task creation, even for the direct run command.

Expected success JSON:

```json
{
  "taskID": "task-id"
}
```

Hard validation limits:

- Unknown input handles are rejected.
- Missing required values are rejected.
- Type mismatches are rejected.
- `--data` must decode to a plain JSON object.
- File widget validation is patched to require URI strings instead of local
  paths or binary payloads.
- If an input handle schema contains `contentMediaType` and the value is not
  `oomol/secret`, current local validation rejects it.

Practical implication:

- If a handle is URI-compatible, a previously uploaded file's `downloadUrl` may
  be submitted as the JSON value.
- Stop instead of pretending that raw file bytes, local paths, or unsupported
  special-media handles can be submitted safely through normal JSON payloads.

## `cloud-task result`

Canonical form:

```bash
oo cloud-task result "<taskId>" --json
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

If the result snapshot contains HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`,
treat the failure as insufficient credit or overdue billing and stop instead of
retrying.

Result URL implication:

- `resultURL` is a remote artifact location returned by the service.
- If an agent needs a local copy, use `oo file download` to materialize it.

## `cloud-task wait`

Canonical form:

```bash
oo cloud-task wait "<taskId>" --timeout "<window>"
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
- If the wait output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop and
  send the user to https://console.oomol.com/billing/recharge.

## Command selection summary

Use this order:

1. Convert the user request into `2` to `6` English keywords.
2. Run `packages search --json`.
3. Run `packages info --json` for the serious candidates.
4. Choose one primary package and optionally one fallback.
5. Ask focused follow-up questions only for missing required inputs.
6. Upload local files with `file upload --json` when a selected handle needs a
   URI value.
7. Run `cloud-task run --json`.
8. Share `taskID` immediately.
9. Use bounded `cloud-task wait` windows when appropriate.
10. After a non-zero wait exit, run `cloud-task result --json` and stop on
    billing signals such as HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`.
11. If a successful task yields a remote artifact URL and a local copy would
    help the user, materialize it with `oo file download` and add `--name` when
    the inferred saved file name would be opaque.
