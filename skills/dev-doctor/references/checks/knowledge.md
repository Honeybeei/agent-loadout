# Knowledge Form

The frontmatter, heading, and file name of each Knowledge document. Read [Knowledge documentation](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#form) before proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| Missing or invalid `canonical_for` | Add the topics the document owns |
| Incomplete or wrong `subdocs` | List every direct child, and only existing ones |
| Not exactly one H1 heading | Keep one title, and demote the other headings |
| A file name that is not kebab-case | Rename the file, and update its incoming links and `subdocs` entries |

This group has no judgment checks.
