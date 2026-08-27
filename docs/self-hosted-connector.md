# Self-Hosted Connector Integration Guide

[English](./self-hosted-connector.md) | [简体中文](./self-hosted-connector.zh-CN.md)

Command reference: [commands.md](./commands.md)

This guide explains how to point the `oo` CLI at a connector server you run
yourself instead of the OOMOL-hosted connector, and what HTTP contract such a
server must expose. It covers two audiences:

- **Operators** who want their connector commands to talk to a self-hosted
  server (the "Getting started", "Runtime tokens", "Routing", and
  "Troubleshooting" sections).
- **Server implementers** who want to build a server the CLI can talk to (the
  "Server contract" section).

## Overview

A self-hosted connector is a **capability override, not an account**. When one
is configured, the connector-family commands route their requests to your
server instead of the OOMOL-hosted connector service. Everything else about the
CLI — your OOMOL account, billing, skills — is unchanged.

Key properties:

- The configuration lives in `connector.toml`, stored **separately from**
  `auth.toml`. Logging in to a self-hosted connector never touches your OOMOL
  account, and vice versa.
- The self-hosted runtime has **no account concept**. Authentication, when
  enabled, is a single runtime API token rather than per-user login.
- Only connector-family commands are affected. Commands that need an OOMOL
  account (file upload, LLM, skills publishing, etc.) keep requiring
  `oo auth login`.

The following commands route to the configured self-hosted connector:

- `oo connector search`
- `oo connector schema`
- `oo connector run`
- `oo connector apps`
- `oo connector proxy`
- `oo search` (top-level alias of `oo connector search`)

## Prerequisites

1. A running connector server reachable over `http://` or `https://` that
   implements the [Server contract](#server-contract) below. During local
   development this is typically something like `http://localhost:3000`.
2. The server's base URL. It may include a path prefix (for example when the
   server sits behind a reverse proxy at `https://example.com/oo-connector`).
3. Optionally, a **runtime token** if the server has authentication enabled.
   Tokens are created on the server's `/access` page.

## Getting started

Connect to a server that has authentication disabled:

```bash
oo connector login http://localhost:3000
```

Connect to a server that requires a runtime token:

```bash
oo connector login https://connector.example.com --token <runtime-token>
```

On success the CLI prints the connected server URL, reports whether the token
was verified, and points you to `<url>/access` for managing runtime tokens:

```text
✓ Connected to the self-hosted connector at https://connector.example.com
The token was accepted by the server.
Manage runtime tokens at https://connector.example.com/access
```

After a successful login, every connector-family command uses this server:

```bash
oo connector search "send an email"
oo connector schema "gmail.send_email"
oo connector run gmail --action send_email --data '@payload.json'
oo connector apps gmail
```

When you are done, switch connector commands back to your OOMOL account:

```bash
oo connector logout
```

### What `oo connector login` validates

Before saving anything, `login` probes the server's health endpoint
(`GET /v1/health`, with a 10-second timeout) so a misconfigured URL fails
immediately instead of surfacing later during a real command:

- A non-`http(s)` URL, or a URL that carries a query string, fragment, or
  embedded `user:pass@` credentials, is rejected with exit code `2` before any
  request is made.
- An empty token, or one containing whitespace or control characters, is
  rejected with exit code `2`.
- An unreachable server, an HTTP `401`, or a response that is not a valid
  connector health payload exits `1`. The `401` error includes a hint to create
  a runtime token at `<url>/access`.

Only after the health check passes is the configuration written to
`connector.toml`.

## Runtime tokens

If your server enforces authentication, pass a token created on the server's
`/access` page:

```bash
oo connector login https://connector.example.com --token <runtime-token>
```

The CLI sends the token as an `Authorization: Bearer <token>` header on every
connector request.

Token verification is best-effort and honest about what it can prove:

- **Token accepted.** The authenticated health check succeeded and a
  header-less probe was rejected, so the token is genuinely required and valid.
  Output: `The token was accepted by the server.`
- **Token could not be verified.** The server also accepts unauthenticated
  requests, so a `200` does not prove the token is valid. The configuration is
  still saved and a warning is printed.
- **No token configured.** Output notes that if the server enables tokens
  later, you should create one at `<url>/access` and log in again.

## Routing precedence

When a connector-family command runs, it resolves its target server with this
precedence (first match wins):

| Priority | Source | Target |
| --- | --- | --- |
| 1 | `OO_CONNECTOR_URL` (+ optional `OO_CONNECTOR_TOKEN`) | Self-hosted server from the environment |
| 2 | `OO_API_KEY` (+ optional `OO_ENDPOINT`) | OOMOL-hosted connector for that key |
| 3 | `connector.toml` (saved by `oo connector login`) | Persisted self-hosted server |
| 4 | The active OOMOL account | OOMOL-hosted connector for that account |

Two consequences worth remembering:

- `OO_API_KEY` outranks a saved `connector.toml`. Setting an explicit hosted
  credential always routes connector commands to the OOMOL service, so a
  persisted self-hosted configuration never hijacks an explicit hosted key.
  Only `OO_CONNECTOR_URL` outranks `OO_API_KEY`.
- If none of the above resolve and the command needs a target, it falls back to
  the active account and raises the standard "login required" error.

### Environment overrides (headless / CI)

`OO_CONNECTOR_URL` and `OO_CONNECTOR_TOKEN` point connector commands at a
self-hosted server **without touching `connector.toml`**. This mirrors how
`OO_API_KEY` works for the OOMOL services and is the recommended approach for
containers and CI:

```bash
export OO_CONNECTOR_URL="https://connector.example.com"
export OO_CONNECTOR_TOKEN="<runtime-token>"   # optional
oo connector run gmail --action send_email --data '@payload.json'
```

Notes:

- `OO_CONNECTOR_TOKEN` is ignored when `OO_CONNECTOR_URL` is not set.
- The environment override does not modify or remove any saved
  `connector.toml`; it simply takes precedence for the current process.
- `oo connector logout` removes the saved configuration only. It does **not**
  clear `OO_CONNECTOR_URL`; unset that variable yourself to fall back.

## Feature differences vs the OOMOL-hosted connector

A self-hosted runtime exposes a smaller surface than the OOMOL service. The CLI
adapts as follows:

- **Team identity is not supported.** `--team` is rejected with exit code `2` on
  `oo connector run`, `oo connector proxy`, and `oo connector apps`, and any
  saved account default team and the `OO_TEAM_ID` / `OO_TEAM_NAME`
  environment variables are ignored. `--personal` is accepted (it is already
  the effective behavior).
- **Async lifecycle waiting is unavailable.** `--wait` and `--wait-result` fail
  with the existing "unsupported" errors because the self-hosted runtime does
  not expose the async result-lifecycle contract.
- **Proxy depends on server support.** `oo connector proxy` works only if your
  server implements the proxy endpoint; the reference open-source runtime
  currently returns an error for it.

Commands that require an OOMOL account continue to require one regardless of the
self-hosted configuration, including `oo file upload`, the `oo llm` commands,
`oo variables`, and the `oo skills` search/install/publish/sync commands. When
they fail, run `oo auth login`.

## Inspecting the configuration

`oo auth status` reports the active self-hosted connector alongside your OOMOL
accounts. In text mode it adds a block with the server URL, whether a token is
configured (the token value itself is never printed), and the configuration
source:

```text
✓ Self-hosted connector: https://connector.example.com
  - Token configured: yes
  - Source: file
```

In JSON mode (`oo auth status --json`), the payload carries an optional
top-level `connector` object:

```json
{
  "connector": {
    "url": "https://connector.example.com",
    "tokenConfigured": true,
    "source": "file"
  }
}
```

- `source` is `env` when the configuration comes from `OO_CONNECTOR_URL`, or
  `file` when it comes from `connector.toml`.
- The block is present whenever a self-hosted connector is configured, even
  when `status` is not `logged-in` — this is how an agent detects
  "self-hosted-only" mode.
- Remember that when `OO_API_KEY` is set, connector commands route to the OOMOL
  service even if a `source: "file"` configuration exists (only
  `OO_CONNECTOR_URL` outranks `OO_API_KEY`).

## Storage: `connector.toml`

The saved configuration is a small TOML file in the configuration root
directory:

- macOS: `~/Library/Application Support/oo/connector.toml`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/oo/connector.toml`
- Windows: `%APPDATA%\oo\connector.toml`

`OO_CONFIG_DIR` overrides the configuration root directly. The file exists only
after `oo connector login`; an untouched installation has none. Its contents:

```toml
[self_hosted]
url = "https://connector.example.com"
token = "<runtime-token>"   # present only when a token was configured
```

`oo connector logout` removes the `[self_hosted]` block. A corrupt
`connector.toml` is cleared by logout as well, so logout always leaves the
configuration removed.

## Server contract

To be usable as a self-hosted connector, your server must implement the
following HTTP endpoints. All paths are appended to the configured base URL by
string concatenation, so any path prefix in the base URL (for example
`https://example.com/oo-connector`) is preserved.

| Method | Path | Used by | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/health` | `oo connector login` | Health check for login validation |
| `GET` | `/v1/actions/search?q=<text>` | `oo connector search`, `oo search` | Semantic action search |
| `GET` | `/v1/actions/<service>.<action>` | `oo connector schema` | Action metadata / schema |
| `POST` | `/v1/actions/<service>.<action>` | `oo connector run` | Run one action |
| `GET` | `/v1/apps/services/<service>` | `oo connector apps` | List connected apps for a service |
| `POST` | `/v1/proxy/<service>` | `oo connector proxy` | Proxy a provider API request |

Service and action names are URL-encoded; the run/schema path uses the
`<service>.<action>` form (for example `/v1/actions/gmail.send_email`).

### Authentication

- If a runtime token is configured (via `--token`, `connector.toml`, or
  `OO_CONNECTOR_TOKEN`), every request carries an
  `Authorization: Bearer <token>` header. Compare it exactly.
- A server with authentication disabled should accept requests that carry no
  `Authorization` header.
- Return HTTP `401` to signal that a token is required. `oo connector login`
  turns a `401` into a message pointing the user to `<url>/access`.

### Health response (`GET /v1/health`)

Return HTTP `200` with a JSON envelope whose `success` is `true` and whose
`data.ok` is `true`. Additional envelope fields are ignored, so you can extend
it freely:

```json
{ "success": true, "data": { "ok": true } }
```

`oo connector login` treats any of the following as failure: a non-`200`
status, a non-JSON body, or an envelope where `success` or `data.ok` is not
`true`.

### Search response (`GET /v1/actions/search`)

Return a JSON object with a `data` array. Each entry describes one action; the
CLI reads `service`, `name`, `description`, `authenticated`, `accessStatus`,
`inputSchema`, and `outputSchema`:

```json
{
  "data": [
    {
      "service": "gmail",
      "name": "send_email",
      "description": "Send an email",
      "authenticated": true,
      "accessStatus": "available",
      "inputSchema": { "...": "..." },
      "outputSchema": { "...": "..." }
    }
  ]
}
```

`authenticated` reflects whether the service already has a connected,
authorized app on the server. `accessStatus` is either `available` or
`connection_required` and indicates whether the action can be used immediately.
The server may omit `accessStatus`; the CLI then derives `available` when
`authenticated` is `true`, and `connection_required` otherwise.
The CLI surfaces both fields directly in search output and warms its local schema
cache from the returned `inputSchema` / `outputSchema`.

### Metadata response (`GET /v1/actions/<service>.<action>`)

Return the single action's contract under a top-level `data` object, with the
same `service`, `name`, `description`, `inputSchema`, and `outputSchema` fields.

### Run request (`POST /v1/actions/<service>.<action>`)

The CLI sends `Content-Type: application/json` and a body of the form:

```json
{ "input": { "...": "action input data" } }
```

A successful response uses the stable `{ data, meta: { executionId } }` shape.
On failure, include a `message` and an `errorCode` in the body when possible;
the CLI surfaces both in its error output.

### Apps and proxy

- `GET /v1/apps/services/<service>` returns the connected apps for a service,
  used by `oo connector apps`.
- `POST /v1/proxy/<service>` proxies a provider API request, used by
  `oo connector proxy`. Implement it only if you support proxy execution.

### The `/access` page

`<base-url>/access` is a web page (not an API the CLI calls) where users create
and manage runtime tokens. The CLI references it in login output and in the
`401` error hint, so hosting a page there makes token management discoverable.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `The connector URL ... is not a valid http(s) URL.` (exit 2) | The URL is not `http(s)`, or it carries a query, fragment, or embedded credentials. Pass a clean origin such as `http://localhost:3000`. |
| `The connector token must not be empty or contain whitespace or control characters.` (exit 2) | The `--token` value is empty or contains whitespace/control characters. |
| `Could not reach the connector server at ...` (exit 1) | The server is unreachable during login. Confirm it is running and the URL is correct. |
| `The connector server rejected the request (HTTP 401).` (exit 1) | The server requires a token. Create one at `<url>/access` and pass it with `--token`. |
| `The server at ... did not return a connector health response.` (exit 1) | The URL points at something that is not a connector server, or `/v1/health` does not return the expected envelope. |
| `Could not reach the self-hosted connector at ...` (during a command) | The saved server is down. Start it, or run `oo connector login` to reconfigure. This is not a sandbox or permission problem — do not retry with elevated permissions. |
| `The --team option is not supported by a self-hosted connector.` (exit 2) | Self-hosted runtimes have no team identity. Drop `--team`, or use `--personal`. |
| A command needs an OOMOL account | Non-connector features (file upload, LLM, skills) still require `oo auth login`. |
