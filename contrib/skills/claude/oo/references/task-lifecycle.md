# Task Lifecycle

Read this file only after `oo cloud-task run` returns a `taskID`.

## Wait with bounded windows

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

Policy:

- Prefer bounded wait windows over a single long wait.
- Do not treat timeout as task failure.
- Never re-create a task just because a wait window ended.
- If wait output shows HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`, stop and send
  the user to https://console.oomol.com/billing/recharge.

## Inspect the latest result snapshot

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

Rules:

- In-progress statuses include `queued`, `scheduling`, `scheduled`, and
  `running`. Treat any of them as non-terminal.
- Use `oo cloud-task result` after a non-zero wait exit to distinguish timeout,
  failure, and a late success.
- If the result snapshot contains HTTP `402` or `OOMOL_INSUFFICIENT_CREDIT`,
  treat it as a billing problem and stop instead of retrying.
- If a successful result includes `resultURL` and a local copy would help the
  user, read [file-transfer.md](file-transfer.md) and use only
  `oo file download` for that artifact.
