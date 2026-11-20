# Spec Delta

## MODIFIED Requirements

### Requirement: Skills and MCP servers from the checkout
Skills and MCP servers SHALL be whatever the vendor CLI reads natively from the checkout (Claude Code: `.claude/skills`, `.mcp.json`, `.claude/settings.json`). Factory8 adds only its own `factory8` plugin, and only to ship steps (`factory8-plugin` spec).

#### Scenario: Project skill
- **WHEN** the repo has `.claude/skills/<name>/SKILL.md`
- **THEN** the agent in the sandbox can use that skill

#### Scenario: Ship step
- **WHEN** a ship step starts on a repo with its own skills
- **THEN** the agent can use the repo's skills and the `/factory8:*` commands
