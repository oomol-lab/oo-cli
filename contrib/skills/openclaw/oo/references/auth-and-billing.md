# Auth and Billing

Read this file only when command availability, authentication, or billing state
becomes relevant.

## Operating principle

- Try the intended remote `oo` command first.
- Do not run `oo auth status` as a routine precheck.
- Check auth only when command output suggests auth may be the blocker.

## Remote commands that depend on the current account

- `oo search`
- `oo packages info`
- `oo connector search`
- `oo connector run`
- `oo file upload`
- `oo cloud-task run`
- `oo cloud-task result`
- `oo cloud-task wait`

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

## Billing is a separate blocker

- If any `oo` command output shows HTTP `402` or includes the string
  `OOMOL_INSUFFICIENT_CREDIT`, stop immediately.
- Treat that signal as a billing problem, not as a normal auth failure.
- Explain that the current account has insufficient credit or is overdue.
- Ask the user to recharge before retrying at
  https://console.oomol.com/billing/recharge.
