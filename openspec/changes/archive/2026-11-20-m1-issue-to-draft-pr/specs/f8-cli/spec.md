# Spec Delta

## Purpose

`f8` is how an engineer drives Factory8 from the terminal (invariant 14, PLT-5). M1 adds `f8 run`.

## ADDED Requirements

### Requirement: f8 run starts a run from an issue
`f8 run <issue>`, run in a clone of the repo, SHALL start a run on that repo with a task prompt that asks the agent to resolve the issue and open a draft PR that closes it. It SHALL wait for the run and print the agent's summary, which ends with the draft PR's URL. The repo is `https://github.com/<owner>/<repo>`, taken from the clone's `origin` remote whatever its form.

#### Scenario: Issue to draft PR
- **WHEN** the user runs `f8 run 12` in a clone of factory8/factory8
- **THEN** a run starts for issue #12, and when it finishes the agent's summary is printed, ending with the draft PR's URL

#### Scenario: SSH remote
- **WHEN** `origin` is `git@github.com-work:librepod/marketplace.git`
- **THEN** the run's repo is `https://github.com/librepod/marketplace`

#### Scenario: Run fails
- **WHEN** the run fails
- **THEN** `f8 run` prints the reason and exits non-zero
