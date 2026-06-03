# OO Skill Install Preparation

Use this guide before running an `oo skills install ...` command shared by a user. Keep the exact package and options from that shared command.

## 1. Ensure OO CLI Is Available

Check whether `oo` is already installed:

```bash
oo --version
```

If the command is missing, install OO CLI with the command for the current platform.

macOS / Linux:

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

Windows CMD:

```cmd
curl -fsSL https://cli.oomol.com/install.cmd -o install.cmd && install.cmd && del install.cmd
```

Open a new terminal if the installer updated PATH and `oo` is still unavailable in the current shell.

## 2. Check Login State

```bash
oo auth status
```

If the user is logged out, the current account is missing, or the API key is invalid, run:

```bash
oo login
```

## 3. Install the Skill

Run the exact install command provided by the user, for example:

```bash
oo skills install <package> -y
```

Do not guess the package name. Use the exact install command from the user. If the user did not provide a clear package or install command, ask for it first.
