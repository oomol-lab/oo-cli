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
