<p align="center">
  <img src="./docs/assets/logo.png" alt="oo" width="120" />
</p>

<h1 align="center">oo</h1>

<p align="center">
  Plug AI agents into OOMOL's hosted capabilities and your connected accounts.
</p>

<p align="center">
  <a href="https://github.com/oomol-lab/oo-cli/releases/latest"><img src="https://img.shields.io/github/v/release/oomol-lab/oo-cli?display_name=tag" alt="Release" /></a>
  <a href="https://github.com/oomol-lab/oo-cli/actions/workflows/publish.yaml"><img src="https://img.shields.io/github/actions/workflow/status/oomol-lab/oo-cli/publish.yaml?branch=main&label=Publish" alt="Publish" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/oomol-lab/oo-cli" alt="License" /></a>
  <a href="https://console.oomol.com/connections"><img src="https://img.shields.io/badge/console-oomol.com-blue" alt="Console" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README-ZH_CN.md">简体中文</a>
</p>

---

## What is oo?

`oo` is the CLI that lets AI agents on your machine discover, inspect, and call
OOMOL's hosted capabilities and the third-party services you've already
connected.

Two kinds of capabilities are reachable through `oo`:

- **Connected accounts** — third-party services you authorize once in the
  [OOMOL Console][connections] (Gmail, Google Calendar, Google Drive, Notion,
  Slack, GitHub, and more). Once a service is connected, your AI agent can act
  on it through `oo` without re-authenticating.
- **Hosted capabilities** — managed AI pipelines such as OCR, translation,
  transcription, text-to-speech, text-to-image, subtitling, and long-document
  understanding.

You don't memorize commands. The bundled skills teach supported AI agents
when and how to route out-of-workspace work through `oo`.

## How it works

1. **Install `oo`** on this machine.
2. **Run `oo login`** to link this machine to your OOMOL account.
3. **Connect services** at <https://console.oomol.com/connections>, then ask
   your AI agent — the bundled `oo` skill tells it when and how to call the
   right capability.

## Install

macOS / Linux:

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

Other install scripts (`wget`, Windows CMD, etc.) are listed at
<https://oomol.com/cli/>.

## Quick start

```bash
oo login
```

Then talk to your AI agent in natural language — describe intent, not commands:

> /oo summarize unread Gmail messages from today.

> /oo generate a QR code for https://oomol.com.

`/oo` is the prompt convention picked up by the bundled skill; the agent will
route the request through `oo` for you.

## Supported AI agents

On first launch, `oo` installs bundled skills into any of the following AI
agent hosts that already exist on this machine: Codex, Claude Code, Hermes,
CodeBuddy, WorkBuddy, Trae, Trae CN, OpenClaw, QoderWork, and DeepSeek TUI.

Bundled skills are kept in sync with each `oo` release. See the
[command reference](./docs/commands.md) for the exact skill targets and how to
manage them manually.

## Privacy

`oo` records privacy-constrained telemetry by default. Events do not include
free-form input text, paths, usernames, hostnames, IP addresses, real OOMOL
account ids, or account names. Telemetry controls and the full boundary are
documented in [PRIVACY.md](./PRIVACY.md).

## Links

- [OOMOL Console — Connections](https://console.oomol.com/connections)
- [Command reference](./docs/commands.md)
- [Contributing](./CONTRIBUTING.md)
- [Privacy](./PRIVACY.md)

[connections]: https://console.oomol.com/connections
