---
name: oo-create-skill
description: Create, adopt, review, or update local AI agent skills, including ordinary knowledge or workflow skills and skills powered by oo connectors or hosted capabilities. Use when the user asks to create or improve a skill, turn existing files or scripts into a skill, check a skill against modern authoring practices, or build a reusable skill that calls oo at runtime.
<!-- agentic:if agent=claude|hermes -->
allowed-tools: [Bash(oo *)]
<!-- agentic:endif -->
---

# oo Creator Skill

Create local skills with one shared authoring method. Treat OO runtime usage and
the presence of an existing workflow as independent decisions:

- A skill is **standard** when its future runtime does not need `oo`.
- A skill is **OO-powered** when its future runtime calls an OO connector,
  Fusion API, OO-hosted LLM, OO file capability, or another `oo` command.
- A skill has an **existing workflow** when the user points to a directory,
  script, configuration, or skill whose files must be preserved.

Being managed by `oo` does not by itself make a skill OO-powered. Local scripts
also do not imply an OO runtime dependency.

Classify only the generated skill's intended future runtime:

- Authoring-time use of `oo`, including initialization, adoption, validation,
  or research, does not make the generated skill OO-powered.
- A skill that explains or documents OO without executing it is standard.
- A local script or mixed workflow that directly or indirectly invokes `oo` is
  OO-powered.
- If any officially supported runtime path invokes `oo`, including an optional
  path, classify the skill as OO-powered and state whether OO is required or
  optional in the generated skill. An obsolete OO call that the new workflow
  removes does not determine the classification.

## Compose the Workflow

Always read [references/skill-authoring.md](references/skill-authoring.md) and
follow its general authoring process.

Then add the references that match the request:

- Read [references/existing-workflow.md](references/existing-workflow.md) when
  files or an implementation already exist.
- Read [references/oo-powered.md](references/oo-powered.md) when the generated
  skill will use OO at runtime.

The references compose. An existing workflow may produce either a standard or
an OO-powered skill. If runtime dependency is unclear and the answer would
change the generated skill, first inspect available files and context. Ask only
when the remaining ambiguity is a user decision: whether future executions
should call a hosted or connected OO capability or only use instructions, local
files, local tools, and tools already available to the agent.

Do not run OO capability discovery for a standard skill. Do not add an OO
runtime compatibility declaration merely because `oo skills init`, `oo skills
adopt`, or `oo skills validate` manages the skill.

## Shared Acceptance

Before finishing:

1. Verify that the trigger description starts with the user outcome and names
   realistic request phrases, important inputs, and expected outputs.
2. Keep `SKILL.md` compact and move optional detail to one-level-deep
   references. Include scripts or assets only when they are reusable.
3. Preserve existing user files and established commands.
4. Ensure runtime dependencies match the selected standard or OO-powered mode.
5. Validate the completed skill and fix reported contract errors.
6. Exercise realistic positive and negative trigger cases, plus the important
   runtime path, in proportion to the skill's risk and complexity.
7. Report the created or adopted skill path and summarize its runtime
   dependencies.
