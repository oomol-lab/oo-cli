---
name: oo-publish-skill
description: Publish, release, upload, or submit an existing AI agent skill directory with SKILL.md to the OOMOL registry by running oo skills publish, or generate a share prompt for a published skill by running oo skills share, including temporary shares for private packages. Use when the user asks to publish a skill, share a published skill, make a skill available in the OOMOL skill catalog, release a registry skill package, resolve publish visibility, version, adoption, package-name, or overwrite prompts, or publish from a local, agent-installed, registry-installed, or path-based skill source. Do not use for finding, installing, creating, or editing skills unless the final goal is publication or sharing.
---

# oo Publish Skill

Use this skill when the user wants to publish an existing agent skill to the
OOMOL registry or skill catalog. The source can be any valid agent skill
directory with a `SKILL.md`; it does not need to be an oo-specific skill.

## Workflow

### Share a published skill

If the user asks to share a published skill, run:

```bash
oo skills share <skill-id> -y
```

Use the skill id from the current context when the user has just created,
published, or used a specific skill. If no likely skill id is available, ask the
user which skill or package to share. `oo skills share` will confirm the
resolved id and package, then print the copyable share prompt. Public packages
are shared directly. Private packages create a temporary share id and the
prompt must use `<packageName>#<shareID>`. Private package shares support optional limits:
`--days <days>` sets the share duration, defaults to 7, and cannot exceed 7;
`--downloads <downloads>` limits install count; omitting `--downloads` leaves installs unlimited.
That prompt is meant for recipients who may not have OO CLI installed yet: it
must guide them through installing OO CLI, running `oo login`, signing in or
creating an OO account, and then installing the skill in one continuous flow.

### 1. Identify the publish source

Ask for the missing skill id or skill directory path only when needed:

- skill id or path to a skill directory

Choose the command shape from the source:

```bash
oo skills publish <skill-id> --agent codex
oo skills publish <path-to-skill-directory>
```

When publishing by skill id from Codex, include `--agent codex`. When publishing
by filesystem path, pass the path directly and omit `--agent`.

The publish command performs its own environment, authentication, and account
checks, so run it directly.

Let `oo skills publish` resolve visibility unless the user explicitly asks for
`private` or `public`. Pass `--visibility` only for that explicit request.

Do not ask whether to publish to the current account. `oo skills publish`
resolves the account and asks any necessary ownership questions itself.

### 2. Publish through oo

Run the publish command directly:

```bash
oo skills publish my-skill --agent codex
oo skills publish ./my-skill
oo skills publish my-skill --agent codex --visibility public
```

If the command prompts about adopting a path or agent-installed skill, publishing
a registry-installed skill under the active account, or overwriting an existing
remote package, let that prompt drive the next user confirmation. Do not ask
those questions in advance.

Do not package manually, do not use `npm publish`, and do not copy files into an
arbitrary fallback directory.

### 3. Report the result

Report the published package name, version, visibility, and hub URL from the
command output. Also mention any local adoption or metadata writeback that
occurred. If publish fails, do not retry blindly; summarize the failing command,
the user-facing error, and the smallest next fix.
