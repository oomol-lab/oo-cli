# oo

[English](./README.md) | [简体中文](./README-ZH_CN.md)

`oo` is OOMOL's command-line interface for working with OOMOL accounts,
packages, and cloud tasks from the terminal.

## Overview

`oo` provides a terminal interface for common OOMOL workflows. It covers
account authentication, persisted CLI configuration, package discovery, package
inspection, cloud task execution, and shell completion generation.

## Installation

Choose the command for your platform:

macOS / Linux (pick one):

```bash
wget -qO - https://cli.oomol.com/install.sh | bash
```

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

Windows CMD:

```bat
curl -fsSL https://cli.oomol.com/install.cmd -o install.cmd && install.cmd && del install.cmd
```

## Quick Start

1. Log in:

```bash
oo login
```

2. Open Codex and start working with:

```text
$oo generate a QR code for the string OOMOL
```

## Bundled Skills

On the first `oo` launch, bundled skills are installed automatically into each
supported local host that already exists:

- Codex: `${CODEX_HOME:-~/.codex}/skills/oo` and
  `${CODEX_HOME:-~/.codex}/skills/oo-find-skills`
- Claude Code: `~/.claude/skills/oo` and `~/.claude/skills/oo-find-skills`
- Hermes: `${HERMES_HOME:-~/.hermes}/skills/oo` and
  `${HERMES_HOME:-~/.hermes}/skills/oo-find-skills`
- CodeBuddy: `~/.codebuddy/skills/oo` and
  `~/.codebuddy/skills/oo-find-skills`
- WorkBuddy: `~/.workbuddy/skills/oo` and
  `~/.workbuddy/skills/oo-find-skills`
- Trae: `~/.trae/skills/oo` and `~/.trae/skills/oo-find-skills`
- Trae CN: `~/.trae-cn/skills/oo` and
  `~/.trae-cn/skills/oo-find-skills`
- OpenClaw: `${OPENCLAW_HOME:-~/.openclaw}/skills/oo` and
  `${OPENCLAW_HOME:-~/.openclaw}/skills/oo-find-skills`
- QoderWork: `~/.qoderwork/skills/oo` and
  `~/.qoderwork/skills/oo-find-skills`

Then you can use them in any supported host. For example, in Codex:

```text
$oo generate a QR code for the string OOMOL
```

You can also install all bundled skills explicitly with:

```bash
oo skills install
```

And you can install the search helper explicitly with:

```bash
oo skills install oo-find-skills
```

## Telemetry

`oo` records privacy-constrained command usage telemetry by default. Telemetry
events do not include free-form input text, paths, usernames, hostnames, IP
addresses, real OOMOL account ids, or account names. Events are sent with
PostHog person profile processing disabled and use a random local device id for
device-level aggregation.

Disable telemetry with `oo telemetry disable`, `OO_TELEMETRY_DISABLED=1`, or
`DO_NOT_TRACK=1`. Use `oo telemetry status` to inspect the effective state and
pending local event count. See [PRIVACY.md](./PRIVACY.md) for the full
telemetry boundary.

## Documentation

- [Command reference](./docs/commands.md)

## Contributing

For contribution workflow and repository conventions, see
[CONTRIBUTING.md](./CONTRIBUTING.md).
