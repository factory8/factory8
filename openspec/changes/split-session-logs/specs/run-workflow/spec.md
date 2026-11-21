# Spec Delta

## MODIFIED Requirements

### Requirement: A sandbox per step
Each step SHALL run in its own sandbox (`sandbox` spec), created for that step, with its pod and then its PVC deleted when the step ends, whatever the outcome. A step SHALL see earlier steps' work only through the run branch and the PR, never through their sessions, handoff notes or uncommitted files.

#### Scenario: Reviewer can't see the author's session
- **WHEN** `review-1` starts after plan and build
- **THEN** its sandbox has a new PVC and its own empty folder of the log volume, with no session files or state from the plan or build steps, and its checkout comes from the pushed run branch

#### Scenario: Step fails
- **WHEN** a step exits `failed`
- **THEN** that step's pod and PVC are deleted, its session logs stay on the log volume, and no other step's sandbox exists
