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

## Codex Skills

On the first `oo` launch, or after running `oo skills install`, Codex will get
the bundled `oo` skill under `${CODEX_HOME:-~/.codex}/skills/oo`.

Then you can use it in Codex, for example:

```text
$oo generate a QR code for the string OOMOL
```

You can also install it explicitly with:

```bash
oo skills install
```

## Documentation

- [Command reference](./docs/commands.md)

## Contributing

For contribution workflow and repository conventions, see
[CONTRIBUTING.md](./CONTRIBUTING.md).
