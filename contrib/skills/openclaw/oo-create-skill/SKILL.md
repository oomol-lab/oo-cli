---
name: oo-create-skill
description: >-
  Create or update a local agent skill for a known OOMOL package workflow. Use
  when the user already knows which oo package or block should power the
  workflow and wants reusable skill instructions.
---

# oo Create Skill

Use this skill when the user wants to create or update a local skill around an
OOMOL package workflow.

## Workflow

### 1. Collect only the information needed

Ask for missing authoring inputs only when they are needed:

- skill name
- workflow purpose
- known package names
- stable block names, when the user knows them
- user inputs the skill should collect
- workflow ordering and expected outputs
- optional display title and icon preference

### 2. Resolve concrete package and block references

If the user provides only package-level information, inspect the package before
writing the skill:

```bash
oo packages info "<packageName>" --json
```

Use the returned metadata to identify stable block references, input concepts,
and output concepts. Prefer the most specific safe reference:
`oo::packageName::blockName` when a block is clearly part of the intended
workflow, or `oo::packageName` only when the block must remain a deliberate
runtime choice based on user intent.

If the user does not know the package name, or the workflow clearly needs an
additional package, use `oo search` to find candidate packages before authoring.
After choosing packages and blocks, do not leave package discovery to the
generated skill.

### 3. Initialize the local skill

When creating a new skill, run `oo skills init <name>` with a required
`--description` value. Also pass `--title` and `--icon` when those values are
known. Pass `--title` only when the user provided or confirmed a concise display
title. If initialization fails because the local canonical directory or an agent
target directory already exists, ask the user for a different skill name instead
of overwriting.

### 4. Author the workflow instructions

Write the generated skill in domain terms: when to use it, what to ask the
user, which workflow steps to follow, and what outputs to report. Reference
packages with `oo::packageName` and stable blocks with
`oo::packageName::blockName`.

Preserve the generated frontmatter `metadata.title` field when it exists. If
you change the skill's displayed title or first heading, update
`metadata.title` to the same human-readable title. If the field is absent, do
not add it by deriving a title from the skill name.

The final generated skill must contain concrete package or block references. It
must not instruct the future agent to run `oo search` or discover packages at
execution time.

Do not duplicate oo execution mechanics in authored prose. The initialized
`SKILL.md` already contains the managed OO notice that tells agents how to
inspect and run referenced packages.

Keep `SKILL.md` concise. Use `references/workflow.md` only when the workflow
has several steps, decision rules, or examples. Use `references/packages.json`
only when captured package metadata will help future updates.

### 5. Validate before finishing

After editing the skill, run `oo skills validate "<skill-directory>"`. If
validation fails, fix the generic skill contract before reporting completion.
