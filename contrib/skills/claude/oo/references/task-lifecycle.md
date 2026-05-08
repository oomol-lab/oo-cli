# Task Lifecycle

Read this file only after `oo cloud-task run` returns a `taskID`.

## Goal

Treat `taskID` as a task handle, not as the final result. Make progress without
recreating work: wait in bounded windows, inspect the latest result snapshot,
and materialize artifacts only after success.

## Wait with a bounded window first

Canonical form:

```bash
oo cloud-task wait "<taskId>" --timeout "<window>"
```

Facts:

- `oo cloud-task wait` does not support `--json`.
- It polls every `3` seconds.
- Default timeout is `6h`.
- Minimum timeout is `10s`.
- Maximum timeout is `24h`.
- Supported timeout formats include `1m`, `4h`, `120s`, and `360`.
- Success exits with code `0` and prints text output.
- Failed tasks print a result snapshot and then exit non-zero.
- Timeout also exits non-zero.
- While the task is still running, the CLI prints periodic status snapshots.

## Waiting policy

- Prefer a short bounded wait window first instead of a single long wait.
- Choose a window based on the task type when no user preference exists: about
  `2m` to `10m` for short tasks, `15m` to `30m` for medium tasks, and `30m` to
  `60m` for long or unknown tasks.
- Do not treat timeout as task failure.
- Never re-create a task just because a wait window ended.
- If wait output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop and read
  [auth-and-billing.md](auth-and-billing.md).

## Inspect the latest result snapshot

Canonical form:

```bash
oo cloud-task result "<taskId>" --json
```

Use this after a non-zero wait exit, when the user asks for status, or when a
previous wait window may have timed out before a late success.

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

## Interpret the latest state

- In-progress statuses include `queued`, `scheduling`, `scheduled`, and
  `running`. Treat any of them as non-terminal.
- Use `oo cloud-task result` after a non-zero wait exit to distinguish timeout,
  failure, and late success.
- If the result snapshot contains HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`,
  treat it as a billing problem and stop instead of retrying.
- If the task succeeded and `resultURL` is present, read
  [file-transfer.md](file-transfer.md) before downloading the artifact.
- If the task succeeded and `resultURL` is missing or `null`, do not invent a
  download URL from `resultData` or logs. Report the success using the returned
  structured result.
- If the task failed, report the failure state and useful error details from the
  result snapshot without creating a replacement task unless the user asks to
  retry with changed inputs.
