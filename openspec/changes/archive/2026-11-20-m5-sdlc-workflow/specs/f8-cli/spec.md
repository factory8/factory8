# Spec Delta

## MODIFIED Requirements

### Requirement: f8 run starts a run from an issue
`f8 run <issue>`, run in a clone of the repo, SHALL start an SDLC run (`run-workflow` spec, "Run stages") on that repo for the issue. It SHALL wait for the run and print the final review's summary, which ends with the PR's URL. The repo is `https://github.com/<owner>/<repo>`, taken from the clone's `origin` remote whatever its form.

#### Scenario: Issue to ready PR
- **WHEN** the user runs `f8 run 12` in a clone of factory8/factory8
- **THEN** an SDLC run starts for issue #12, and when it finishes the final review's summary is printed, ending with the URL of a PR that is ready for review

#### Scenario: SSH remote
- **WHEN** `origin` is `git@github.com-work:librepod/marketplace.git`
- **THEN** the run's repo is `https://github.com/librepod/marketplace`

#### Scenario: Run fails
- **WHEN** the run fails, including with `changes_requested`
- **THEN** `f8 run` prints the reason and exits non-zero
