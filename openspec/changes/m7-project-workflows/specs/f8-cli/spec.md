# Spec Delta

## MODIFIED Requirements

### Requirement: f8 run --flow ship starts a ship run
`f8 run --flow ship <issue>`, run in a clone, SHALL start a ship run for that issue on the clone's repo. While it waits, it SHALL print each stage change and any open question, together with the `f8 answer` command that replies. When the run ends `ready`, it SHALL print the PR's URL. Otherwise it SHALL print the outcome, the cause and the note, and exit non-zero. Without `--flow`, `f8 run` starts the SDLC run as before.

#### Scenario: Ready
- **WHEN** the user runs `f8 run --flow ship 12` and the run ends `ready`
- **THEN** the stages were printed as they started, and the last line is the PR's URL

#### Scenario: Question
- **WHEN** the run starts waiting for an answer
- **THEN** `f8 run` prints the question and `f8 answer <run> "<text>"`, and keeps waiting

#### Scenario: Malformed flow name
- **WHEN** the user runs `f8 run --flow 9-x 12`
- **THEN** it prints the usage and exits non-zero without starting a run

## ADDED Requirements

### Requirement: f8 run --flow starts any flow on the repo's queue
`f8 run --flow <name> <issue>` SHALL start the workflow `<name>Workflow` on the clone's repo's queue, `factory8/<owner>/<repo>`, for every name, `sdlc` and `ship` included. A name SHALL start with a lowercase letter and hold only letters and digits. While it waits, `f8` SHALL print stage changes and questions as for a ship run.

#### Scenario: Project flow
- **WHEN** a worker serving factory8/factory8 has `gatedWorkflow` and the user runs `f8 run --flow gated 12` in a clone of it
- **THEN** `gatedWorkflow` starts on `factory8/factory8/factory8` for issue 12, and its stages and questions are printed as they come

#### Scenario: Built-in flow on the repo's queue
- **WHEN** the user runs `f8 run 12` in a clone of librepod/marketplace
- **THEN** `sdlcWorkflow` starts on `factory8/librepod/marketplace`

### Requirement: f8 refuses a run when no worker serves the repo
Before it starts any run, `f8` SHALL check that a worker polls the repo's queue. When none does, it SHALL print that no worker serves the repo, name the queue, and exit non-zero without starting a run.

#### Scenario: No worker
- **WHEN** no worker polls `factory8/librepod/marketplace` and the user runs `f8 run --flow ship 3` in a clone of librepod/marketplace
- **THEN** `f8` prints that no worker serves `factory8/librepod/marketplace`, exits non-zero, and no run exists

### Requirement: f8 ends a run that can't start
When a run's history has a failed workflow task and no completed one, `f8 run` SHALL print the first failure's message, terminate the run, and exit non-zero. A run with a completed workflow task SHALL NOT be terminated, wherever the failure is.

#### Scenario: Flow the worker doesn't have
- **WHEN** the user runs `f8 run --flow gatd 12` and the repo's worker has no `gatdWorkflow`
- **THEN** `f8` prints that the worker's workflow bundle has no `gatdWorkflow`, the run is terminated, and `f8` exits non-zero

#### Scenario: Retry completes on another worker
- **WHEN** during a rollout the old worker fails a run's first workflow task and the new worker completes its retry
- **THEN** `f8` doesn't terminate the run, and watches it

### Requirement: f8 prints a run's result by one rule
When a run succeeds, `f8 run` SHALL print its result's `url` when it is a string, else its `summary` when that is a string, else the result as JSON. When it fails, `f8` SHALL print the failure's type and message and exit non-zero.

#### Scenario: Result with a URL
- **WHEN** a run returns `{ "url": "https://github.com/factory8/factory8/pull/40" }`
- **THEN** the last line `f8 run` prints is that URL

#### Scenario: Result with a summary
- **WHEN** an SDLC run returns its final review's exit, whose `summary` ends with the PR's URL
- **THEN** `f8 run` prints that summary, as before

#### Scenario: Run fails
- **WHEN** a run fails with type `rejected` and message `the human said no`
- **THEN** `f8 run` prints `rejected: the human said no` and exits non-zero
