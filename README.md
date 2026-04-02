# oo

[English](./README.md) | [简体中文](./README-ZH_CN.md)

`oo` is OOMOL's command-line interface for working with OOMOL accounts,
packages, and cloud tasks from the terminal.

## Overview

`oo` provides a terminal interface for common OOMOL workflows. It covers
account authentication, persisted CLI configuration, package discovery, package
inspection, cloud task execution, and shell completion generation.

## Installation

```bash
bun install -g @oomol-lab/oo-cli
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

Then you can use them in Codex or Claude Code. For example, in Codex:

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

## Documentation

- [Command reference](./docs/commands.md)

## Contributing

For contribution workflow and repository conventions, see
[CONTRIBUTING.md](./CONTRIBUTING.md).
