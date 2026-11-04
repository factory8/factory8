# Spec Delta

## ADDED Requirements

### Requirement: Run stages
A run for an issue SHALL run its steps in order: `plan`, `build`, then `review-1`, with fix rounds after it (see "Review and fix loop"). Each step SHALL run with its stage's task prompt, under the step ID `<runId>.<stage>.1`. A step that exits `failed` or `needs_input` SHALL end the run as M1 does, and no later step starts.

#### Scenario: Review passes first time
- **WHEN** a run's plan and build steps exit `done` and `review-1` gives the verdict `ready`
- **THEN** the steps `<runId>.plan.1`, `<runId>.build.1` and `<runId>.review-1.1` ran in that order, and the run succeeds

#### Scenario: Build fails
- **WHEN** the build step exits `failed`
- **THEN** the run fails with the step's reason, and no review step starts

### Requirement: A sandbox per step
Each step SHALL run in its own sandbox (`sandbox` spec), created for that step and with its pod deleted when the step ends, whatever the outcome. A step SHALL see earlier steps' work only through the run branch and the PR, never through their sessions, handoff notes or uncommitted files.

#### Scenario: Reviewer can't see the author's session
- **WHEN** `review-1` starts after plan and build
- **THEN** its sandbox has a new PVC with no session files or `/f8/state` from the plan or build steps, and its checkout comes from the pushed run branch

#### Scenario: Step fails
- **WHEN** a step exits `failed`
- **THEN** that step's pod is deleted, and no other step's sandbox exists

### Requirement: Plan step
The plan step's prompt SHALL ask the agent to read the issue and write `.factory8/runs/<runId>/plan.md` with the sections Files that change, Order of work, Risks and Proof. It SHALL also ask it to change no other file, push, and open a draft PR from `factory8/<runId>`. The PR's title is the issue's title, and its body is the agent's summary, then `Run: <runId>` and `Fixes #<issue>`.

#### Scenario: Plan committed, PR opened
- **WHEN** the plan step exits `done`
- **THEN** the run branch has `.factory8/runs/<runId>/plan.md` and no other change, and a draft PR from `factory8/<runId>` exists

### Requirement: Build step
The build step's prompt SHALL ask the agent to implement `plan.md` and to run the repo's checks (its build, test and lint commands, as `AGENTS.md` names them), fixing what fails before it pushes. When the work departs from the plan, `plan.md` is updated in the same commit (BLD-2). The summary includes the checks' final output (TST-2).

#### Scenario: Departure from the plan
- **WHEN** the agent changes a file `plan.md` didn't list
- **THEN** the same commit updates `plan.md`

### Requirement: Review step
A review step SHALL run on the reviewer model (`project-detection` spec). Its prompt SHALL tell the agent that it didn't write the change and that the PR's description and commit messages are claims to verify. The agent reviews the PR's diff against the issue, `plan.md` and the repo's `REVIEW.md` if there is one. It runs the checks, posts its findings as one PR review comment ranked Important or Nit, and changes no file.

#### Scenario: Findings posted
- **WHEN** a review step exits `done`
- **THEN** the PR has a new review comment with the findings ranked Important or Nit, and the step pushed no commit

### Requirement: Review verdict
A review step's final message SHALL end with the line `Verdict: ready` when it found nothing Important, and with `Verdict: changes` otherwise. On `ready`, the agent also marks the PR ready for review.

#### Scenario: Ready
- **WHEN** a review step exits `done` and its summary ends with `Verdict: ready`
- **THEN** the PR is ready for review, and the run succeeds with that summary as its result

#### Scenario: No verdict
- **WHEN** a review step exits `done` and its summary ends with neither verdict line
- **THEN** the run fails with reason `no_verdict`

### Requirement: Review and fix loop
After a review with the verdict `changes`, a fix step `fix-<n>` SHALL address that review's Important findings, run the checks and push. A new review `review-<n+1>` follows it. A run SHALL have at most 2 fix rounds (ORC-3). If `review-3` still gives `changes`, the run fails with `changes_requested` and leaves the PR a draft, so the human decides what happens next.

#### Scenario: One fix round
- **WHEN** `review-1` gives `changes` and `review-2` gives `ready`
- **THEN** the steps after build were `review-1`, `fix-1` and `review-2`, and the run succeeds

#### Scenario: Fix rounds exhausted
- **WHEN** `review-1`, `review-2` and `review-3` all give `changes`
- **THEN** the run fails with `changes_requested` after `fix-1` and `fix-2`, and no further step starts

### Requirement: Agents never merge
Every stage's prompt SHALL tell the agent never to merge the PR or push to the default branch. The run SHALL end at the PR. Merging is the human's decision, made in the forge, and the run doesn't wait for it (DEP-2, G4).

#### Scenario: Run ends at the PR
- **WHEN** a run succeeds
- **THEN** its PR is open and ready for review, unmerged, and the run has finished

## REMOVED Requirements

### Requirement: One-step run
**Reason**: A run is now a sequence of stage steps ("Run stages").
**Migration**: `f8 run` starts the SDLC run. The one-step run is gone, and its step logic serves each stage.

### Requirement: Sandbox deleted at run end
**Reason**: Sandboxes are per step now, and each step's pod is deleted when that step ends ("A sandbox per step").
**Migration**: None. The PVCs still stay (`sandbox` spec, "Session logs outlive the sandbox").
