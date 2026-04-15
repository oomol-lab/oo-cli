# Auth and Billing

Read this file only when command availability, authentication, or billing state
becomes relevant.

## Entrypoint policy

- Run the intended `oo` command directly.
- Do not probe for `oo` with `which`, `command -v`, version checks, or similar
  existence prechecks.

## Commands that require a valid current account

- `oo search`
- `oo packages info`
- `oo connector search`
- `oo connector run`
- `oo file upload`
- `oo cloud-task run`
- `oo cloud-task result`
- `oo cloud-task wait`

## Authentication workflow

- Do not run `oo auth status` as a routine precheck.
- If a remote `oo` command fails and auth may be the cause, run:

```bash
oo auth status
```

- Treat auth as usable only when the output confirms a valid active account.
- If auth status reports logged out, missing, invalid, or request failed, stop
  and ask the user to repair authentication before retrying.
- If the user needs to repair auth, ask them to complete:

```bash
oo auth login
```

## Billing stop condition

- If any `oo` command output shows HTTP `402` or includes the string
  `OOMOL_INSUFFICIENT_CREDIT`, stop immediately.
- Treat that signal as a billing problem, not as a normal auth failure.
- Tell the user their current account has insufficient credit or is overdue.
- Direct them to recharge before retrying at
  https://console.oomol.com/billing/recharge.
