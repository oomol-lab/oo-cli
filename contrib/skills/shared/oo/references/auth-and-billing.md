# Auth and Billing

Read this file only when command availability, authentication, or billing state
becomes relevant.

## Operating principle

- Try the intended substantive `oo` command first.
- Do not run `oo auth status` as a routine precheck.
- Check auth only when command output suggests auth may be the blocker.
- Treat billing separately from auth.

## Remote commands that depend on the current account

- `oo search`
- `oo connector search`
- `oo connector run`
- `oo file upload`

## If auth may be the blocker

Run:

```bash
oo auth status
```

Interpret the result this way:

- If the output confirms a valid active account, continue troubleshooting the
  selected `oo` path instead of blaming auth.
- If the status is logged out, missing, invalid, or the request fails, stop the
  current `oo` path and ask the user to repair authentication first.

When the user needs to repair auth, guide them to:

```bash
oo auth login
```

## Self-hosted connector mode

The user may route connector commands to a self-hosted connector server
instead of an OOMOL account. Detect this mode when either signal appears:

- A command fails with a message saying the self-hosted connector only
  supports connector commands.
- `oo auth status --json` shows a top-level `connector` object while `status`
  is not `logged-in`.

When the `OO_API_KEY` environment variable supplies the credential,
`oo auth status` reports `logged-in` with a top-level `envOverride` object and
no active entry in `accounts[]`. That is an authenticated OOMOL account, not
self-hosted-only mode.

In this mode, connector commands keep working against the self-hosted server:
`oo search`, `oo connector search`, `oo connector schema`, `oo connector run`,
and `oo connector apps`.

Anything that needs an OOMOL account does not work and must not be retried:
`oo file upload`, `oo llm config`, `oo llm json`, `oo variables`, and
`oo skills search`, `oo skills install`, `oo skills publish`, and
`oo skills sync`. Tell the user that capability requires an OOMOL account, ask
them to run `oo auth login`, then stop.

If a connector command fails with a message like
`Could not reach the self-hosted connector at <url>`, report that the
self-hosted server appears to be down and stop. Do not treat it as a sandbox
or permission problem, and do not retry with elevated permissions.

## Billing blocker

Billing has a hard stop signal:

- HTTP `402`
- `OOMOL_INSUFFICIENT_CREDIT`

When either appears in any `oo` command output:

- Stop immediately.
- Treat it as insufficient credit or overdue billing, not a normal auth
  failure.
- Do not retry the same request after a billing stop.
- Ask the user to recharge before retrying at:

```text
https://console.oomol.com/billing/token-recharge
```

## Other blockers

For catalog miss, unsupported input shape, missing required values, connector
re-authorization, or terminal action failure, return to the relevant reference
page and report the named blocker. Do not broaden the problem into generic auth
or billing troubleshooting unless command output points there.
