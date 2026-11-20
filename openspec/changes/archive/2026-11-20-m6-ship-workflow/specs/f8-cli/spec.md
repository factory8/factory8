# Spec Delta

## ADDED Requirements

### Requirement: f8 run --flow ship starts a ship run
`f8 run --flow ship <issue>`, run in a clone, SHALL start a ship run for that issue on the clone's repo. While it waits, it SHALL print each stage change and any open question, together with the `f8 answer` command that replies. When the run ends `ready`, it SHALL print the PR's URL. Otherwise it SHALL print the outcome, the cause and the note, and exit non-zero. Without `--flow`, `f8 run` starts the SDLC run as before.

#### Scenario: Ready
- **WHEN** the user runs `f8 run --flow ship 12` and the run ends `ready`
- **THEN** the stages were printed as they started, and the last line is the PR's URL

#### Scenario: Question
- **WHEN** the run starts waiting for an answer
- **THEN** `f8 run` prints the question and `f8 answer <run> "<text>"`, and keeps waiting

#### Scenario: Unknown flow
- **WHEN** the user runs `f8 run --flow nope 12`
- **THEN** it prints the usage and exits non-zero without starting a run

### Requirement: f8 answer answers a waiting run
`f8 answer <run> "<text>"` SHALL send the text as the answer to that run's open question and exit 0. When the run doesn't exist or isn't waiting, it SHALL print why and exit non-zero.

#### Scenario: Answer
- **WHEN** run `k3x9qa` waits on a question and the user runs `f8 answer k3x9qa "use PostgreSQL"`
- **THEN** the run receives the answer and resumes the waiting step

#### Scenario: Not waiting
- **WHEN** the user answers a run that has no open question
- **THEN** `f8 answer` prints that the run isn't waiting and exits non-zero
