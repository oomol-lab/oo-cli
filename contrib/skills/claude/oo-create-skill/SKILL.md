---
name: oo-create-skill
description: >-
  Author, generate, scaffold, or update a local AI agent skill that turns an
  OOMOL/oo package, connector action, block, or selected workflow into reusable
  instructions. Use when the user asks to create a skill, write a skill, make a
  Codex/Claude/agent skill, or refine an existing local skill for an oo-powered
  workflow, even if capability discovery is needed first.
allowed-tools: ["Bash(oo *)"]
---

# oo Create Skill

Use this skill when the user wants to create, generate, scaffold, author, or
update a local skill around an OOMOL/oo package or connector workflow. This
includes requests to turn a specific package, block, connector action, or
selected workflow into reusable agent instructions, or to create the skill
after the right capability is discovered.

If the user only wants to discover or install existing published skills, use
`oo-find-skills`. If the user wants to publish a finished skill, use
`oo-publish-skill`.

## Workflow

### 1. Collect only the information needed

Ask for missing authoring inputs only when they are needed:

- skill name
- workflow purpose
- known package names, connector services, or connector actions
- stable block names, when the user knows them
- user inputs the skill should collect
- workflow ordering and expected outputs
- likely user requests that should trigger the generated skill
- optional display title and icon preference

If the user does not provide a display title or icon preference, choose them
yourself from the workflow purpose and package or connector metadata instead of
asking only for cosmetic details. Use a concise human-readable title and an
icon reference that fits the workflow. The icon may be an emoji, an image URL, or
`:collection:icon:` where `collection` and `icon` are names from
https://icones.js.org/.

### 2. Resolve concrete package, block, and connector references

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

If the user does not know the package name, the connector action, or the
workflow clearly needs an additional capability, use mixed discovery before
authoring:

```bash
oo search "<goal>" --json
```

Shape `<goal>` as one short English outcome sentence for the current external
step, preserving the user's decisive constraints such as target service,
language pair, file type, and output format. Inspect the first result set
before refining.

Treat package and connector results as first-class authoring candidates. Prefer
the capability that directly matches the intended reusable workflow. When the
target is a connected third-party account, service, or API, prefer a direct
connector action over a package. If a package and connector are equally direct,
prefer an already-authenticated connector because it is usually lower friction
and has no package cost. Prefer a package when the workflow needs package
compute, media/document transformation, or a block-specific capability that no
connector action exposes.

For connector-backed choices, capture the exact `service`, action `name`,
description, authentication state, and schema-derived input/output concepts.
Use `oo connector search "<goal>" --json` only to refine a shortlisted connector
path, not to restart broad discovery. Do not force a package or block reference
when the chosen reusable workflow is connector-backed.

After choosing packages, blocks, or connector actions, do not leave capability
discovery to the generated skill.

### 3. Initialize the local skill

When creating a new skill, run `oo skills init <name>` with a required
`--description` value. Also pass `--title` and `--icon`. If the user did not
provide them, derive a concise display title and suitable icon reference from
the workflow purpose and resolved package or connector metadata before running
initialization. If initialization fails because the local canonical directory or
an agent target directory already exists, ask the user for a different skill
name instead of overwriting.

Make `--description` a user-facing trigger summary because it becomes the
generated skill's frontmatter and is the main signal future agents see before
the skill loads. Start with the outcome the skill helps the user accomplish in
language a user would naturally use. Include the user-visible task, common
request verbs or phrases, domain nouns, important input artifacts, expected
outputs, and user-visible product, model, service, or workflow names that users
are likely to mention.

Prefer one or two concise sentences over a generic label. The description
should answer: "What can this skill do for the user?" and "What would a user ask
that should trigger it?" Keep operational details, routing caveats,
package/block identifiers, schema details, command syntax, and negative
conditions in the workflow body unless those exact names are user-facing terms
that people naturally use in requests.

Use this description shape when helpful:
`<Primary user outcome>. Use when the user asks to <common verbs/request
phrases> for <domain objects or input artifacts>, especially when they need
<expected output/result>.`

### 4. Author the workflow instructions

Write the generated skill in domain terms: when to use it, what to ask the
user, which workflow steps to follow, and what outputs to report. Reference
packages with `oo::packageName` and stable blocks with
`oo::packageName::blockName`. For connector-backed workflows, name the exact
`service.action` and include the minimal `oo connector run "<service>"
--action "<action>" --data '<json>' --json` command shape with schema-derived
input and output concepts. Do not present a local `schemaPath` as a stable
contract for future agents.

Review the generated frontmatter `description` before finishing. It must say
the user-visible outcome first, include common verbs or phrases users would
actually say, name the domain objects or input/output artifacts, and include
user-visible services, models, products, or workflow names when they improve
matching. Avoid generic descriptions such as "use an OOMOL package workflow"
unless they are paired with the concrete user outcome. Move caveats, execution
details, negative guidance, and boundary cases into the workflow body instead of
the frontmatter unless they are needed to prevent direct sibling-skill routing
conflicts.

Preserve the generated frontmatter `metadata.title` field when it exists. If
you change the skill's displayed title or first heading, update
`metadata.title` to the same human-readable title. If `metadata.title` or
`metadata.icon` is absent, add a suitable value rather than leaving the
generated skill without presentation metadata.

The final generated skill must contain concrete package or block references, or
concrete connector service/action identifiers in its workflow instructions. It
must not instruct the future agent to run `oo search`, `oo connector search`, or
discover capabilities at execution time.

Do not duplicate broad oo execution mechanics in authored prose. For
package-backed workflows, the initialized `SKILL.md` already contains the
managed OO notice that tells agents how to inspect and run referenced packages.
For connector-backed workflows, include only the selected service/action
identity, the small connector command shape, and schema-derived payload rules.

Keep `SKILL.md` concise. Use `references/workflow.md` only when the workflow
has several steps, decision rules, or examples. Use `references/packages.json`
only when captured package metadata will help future updates.

### 5. Validate before finishing

After editing the skill, run `oo skills validate "<skill-directory>"`. If
validation fails, fix the generic skill contract before reporting completion.
