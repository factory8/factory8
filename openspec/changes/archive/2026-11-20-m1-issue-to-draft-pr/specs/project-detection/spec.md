# Spec Delta

## Purpose

Defines what a Phase 0 run takes from the repo's default branch and from the installation. There is no `.factory8/project.yaml` until a feature first needs one (PRJ-1, PRJ-8; Phase 1).

## ADDED Requirements

### Requirement: Environment from the Nix dev shell
A project's environment SHALL come from `flake.nix` exposing `devShells.<system>.default`, otherwise from `shell.nix`. A repo with neither SHALL be rejected with "no environment".

#### Scenario: Flake repo
- **WHEN** the repo's `flake.nix` exposes a default dev shell
- **THEN** the project image holds that shell's packages

#### Scenario: shell.nix repo
- **WHEN** the repo has no `flake.nix` but has `shell.nix`
- **THEN** the project image holds that shell's packages

#### Scenario: No environment
- **WHEN** the repo has neither
- **THEN** the project is rejected with "no environment"

### Requirement: Context from AGENTS.md
The agent's project context SHALL be the repo's `AGENTS.md`. For Claude Code, a repo without `CLAUDE.md` gets the adapter's uncommitted import (`agent-adapter` spec, AGT-4).

#### Scenario: AGENTS.md present
- **WHEN** a run starts on a repo with `AGENTS.md`
- **THEN** the agent's session starts with `AGENTS.md` loaded

### Requirement: Skills and MCP servers from the checkout
Skills and MCP servers SHALL be whatever the vendor CLI reads natively from the checkout (Claude Code: `.claude/skills`, `.mcp.json`, `.claude/settings.json`). Factory8 adds none.

#### Scenario: Project skill
- **WHEN** the repo has `.claude/skills/<name>/SKILL.md`
- **THEN** the agent in the sandbox can use that skill

### Requirement: Agent profile from the installation
The agent profile (vendor, model) SHALL be the installation default; no per-project setting is read in Phase 0.

#### Scenario: Default model
- **WHEN** a run starts
- **THEN** its step uses the installation's default vendor and model
