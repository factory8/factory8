# Spec Delta

## MODIFIED Requirements

### Requirement: Stage commands from the factory8 plugin
Each step's prompt SHALL be a `factory8` plugin command:
- `/factory8:<skill>`, then the issue number and `key=value` arguments;
- longer context (findings, notes, an answer, the attempt history) as one JSON object on the next line.

Every step SHALL load the plugin from the installation's plugin repository, at the Factory8 commit its worker image was built from.

#### Scenario: Code review command
- **WHEN** the first code review of issue 12 starts on PR 18 at commit `abc123`
- **THEN** its prompt's first line is `/factory8:review 12 run=<runId> mode=code pr=18 sha=abc123 slot=1`

#### Scenario: Skill changed after the image was built
- **WHEN** a skill changes on the plugin repository's default branch after the worker image was built
- **THEN** the run's steps load the plugin at the image's commit, without the change
