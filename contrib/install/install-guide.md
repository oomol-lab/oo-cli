# OO CLI Install Guide

Use this guide before running any `oo` command. It helps confirm whether the OO CLI is already available and provides the correct installation command for the current platform when needed.

## 1. Check Whether OO CLI Is Available

Run:

```bash
oo --version
```

If the command prints a version number, OO CLI is already installed and available. No additional installation is required.

If the command is missing or cannot be found, install OO CLI using the command for the current platform.

## 2. Install OO CLI

### macOS / Linux

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

### Windows CMD

```cmd
curl -fsSL https://cli.oomol.com/install.cmd -o install.cmd && install.cmd && del install.cmd
```

If the installer updates `PATH` but `oo` is still unavailable in the current shell, open a new terminal and try again.

## 3. Verify the Installation

After installation, run:

```bash
oo --version
```

If the command prints a version number, OO CLI has been installed successfully.
