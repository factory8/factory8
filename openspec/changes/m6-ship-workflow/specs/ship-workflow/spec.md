# Spec Delta

## Purpose

The ship run takes one GitHub issue through graded stages (design, tests, implementation, review, diagnosis), each in its own sandbox, and ends with a PR ready for a human or with the reason it stopped. The Temporal workflow holds the whole flow (ORC-2, ORC-3, ORC-5).

## ADDED Requirements

### Requirement: Ship run stages
A ship run SHALL take one issue through these stages:
1. design;
2. design review;
3. acceptance;
4. tests review;
5. implement;
6. code review;
7. finish.

Between them it runs rework, diagnosis and routing. It ends with the PR ready for a human, or with an outcome that says why it stopped. The workflow's own state holds the flow; no git ref or file records it.

#### Scenario: Straight through
- **WHEN** every review returns `SHIP` the first time on a low-risk issue
- **THEN** the steps `design-1`, `design-review-1`, `acceptance-1`, `tests-review-1`, `implement-1`, `code-review-1` and `finish` run in that order, and the run succeeds with the PR's URL

### Requirement: A sandbox per step
Every step of a ship run SHALL run in its own sandbox: a pod and a PVC named `f8-<runId>-<stage>-<n>`, where `<n>` counts that stage's steps in the run. This includes each attempt and each reviewer. The pod SHALL be deleted when the step ends. A step SHALL see earlier steps' work only on the run branch `f8/<runId>` and on the PR, never through their sessions or files.

#### Scenario: Attempts don't share a sandbox
- **WHEN** a second implement attempt starts
- **THEN** it runs in `f8-<runId>-implement-2` on a new PVC, with no session from `implement-1`

### Requirement: Stage commands from the factory8 plugin
Each step's prompt SHALL be a `factory8` plugin command:
- `/factory8:<skill>`, then the issue number and `key=value` arguments;
- longer context (findings, notes, an answer, the attempt history) as one JSON object on the next line.

Every step SHALL load the plugin from the installation's plugin repository, as it was when the run started.

#### Scenario: Code review command
- **WHEN** the first code review of issue 12 starts on PR 18 at commit `abc123`
- **THEN** its prompt's first line is `/factory8:review 12 run=<runId> mode=code pr=18 sha=abc123 slot=1`

#### Scenario: Skill changed mid-run
- **WHEN** a skill changes on the plugin repository's default branch while a run is implementing
- **THEN** the run's later steps still load the plugin as it was when the run started

### Requirement: Structured step results
Every step SHALL end its final message with one line holding a JSON object in the shape its skill defines (`factory8-plugin` spec). The workflow SHALL read that line and validate it. A missing or invalid result SHALL end the run with outcome `parked` and cause `H`, naming the step.

#### Scenario: Invalid verdict
- **WHEN** a code review returns `SHIP` with a `critical` finding
- **THEN** the run ends `parked` with cause `H`, naming that step

### Requirement: Design step
The design step SHALL commit `.factory8/runs/<runId>/design.md` to the run branch and open a draft PR that closes the issue. The design holds:
- acceptance rows (behaviour → test);
- done-when criteria;
- the files that change;
- a risk, `low` or `high`;
- decisions and assumptions;
- numbered test-first steps.

It changes no code. It MAY stop with cause `C` when the issue is more than one reviewable change.

#### Scenario: Design result
- **WHEN** the design step finishes
- **THEN** its result names the pushed commit, the PR number and the risk

#### Scenario: Issue too big
- **WHEN** the design step stops with cause `C`
- **THEN** no acceptance step runs, and the run ends `too_big` with the step's note

### Requirement: Design and tests are reviewed before implementation
A reviewer SHALL grade the design before acceptance starts, and the tests before implement starts. A grade other than `SHIP` SHALL pass its findings to a new design or acceptance step. Each stage gets at most two grades in a row, and a second grade other than `SHIP` SHALL end the run `escalated`. The design review MAY raise the run's risk to `high`.

#### Scenario: Design fixed after review
- **WHEN** `design-review-1` returns `DO_NOT_SHIP`
- **THEN** `design-2` runs with its findings, and `design-review-2` grades the result

#### Scenario: Tests rejected twice
- **WHEN** `tests-review-1` and `tests-review-2` both return `DO_NOT_SHIP`
- **THEN** no implement step runs, and the run ends `escalated`

#### Scenario: Reviewer raises the risk
- **WHEN** the design says `low` and its review says `high`
- **THEN** the run is high-risk from then on

### Requirement: Acceptance step
The acceptance step SHALL write tests for every acceptance row of the design, push them, and show that they fail on the run branch because the behaviour is missing. Its result SHALL name the commit and the test files. It changes no product code. It MAY stop with cause `B` when the design can't be tested as written, or `C`.

#### Scenario: Tests written first
- **WHEN** the acceptance step finishes
- **THEN** its result names the commit and the test files, and no implement step has run yet

### Requirement: Implement step
Each implement attempt SHALL work test-first on the run branch until the acceptance tests and the repo's checks pass, then push and return the pushed commit. It SHALL NOT change the acceptance tests. A rework attempt SHALL get the previous grade's blocking findings. An attempt MAY stop with a one-line note and one of these causes:
- `A`: the tests can't pass for a correct implementation;
- `B`: the design's premise is false;
- `C`: the issue is too big.

#### Scenario: Rework carries the findings
- **WHEN** `implement-2` starts after `code-review-1` returned `DO_NOT_SHIP`
- **THEN** its command carries that review's `blocker` and `critical` findings

### Requirement: Code review
Each code review SHALL grade one pushed commit against the issue, the design and its acceptance rows. It SHALL:
- first run the repo's checks and quote their output; a failing check is a `blocker`;
- check that the acceptance tests are unchanged since the acceptance commit;
- return `SHIP`, `SHIP_WITH_FIXES` or `DO_NOT_SHIP`, with ranked findings;
- change no file.

#### Scenario: Acceptance test edited
- **WHEN** an implement attempt changed an acceptance test file
- **THEN** its code review returns `DO_NOT_SHIP` with a `critical` finding naming the file

### Requirement: Only blocking findings send work back
Findings SHALL be ranked `blocker`, `critical`, `high`, `medium` or `low`.
- Only `blocker` and `critical` findings block: `SHIP` carries none, and `DO_NOT_SHIP` carries at least one.
- `high`, `medium` and `low` findings SHALL NOT send work back. The finish step lists them on the PR as follow-ups.

#### Scenario: Nits only
- **WHEN** a code review returns `SHIP` with two `medium` findings
- **THEN** no rework runs, and the PR's report lists both findings as follow-ups

### Requirement: Two reviewers for high-risk work
When the run's risk is `high`, each code review SHALL run two reviewers in parallel, in separate sandboxes, and the attempt SHALL pass only if both return `SHIP`. The next attempt SHALL get the blocking findings of both.

#### Scenario: Split verdict
- **WHEN** `code-review-1a` returns `SHIP` and `code-review-1b` returns `DO_NOT_SHIP`
- **THEN** the attempt fails, and `implement-2` gets the findings of `code-review-1b`

### Requirement: Stronger model on each attempt
Implement attempts SHALL climb the installation's ladder of implement profiles: the first attempt of an implement loop uses the first profile, the next attempt the next one, and the last profile repeats.

#### Scenario: Third attempt
- **WHEN** the third attempt of an implement loop starts with a ladder of three profiles
- **THEN** it runs on the third profile

### Requirement: Diagnosis after two failed attempts
When two graded attempts in a row fail, a diagnose step SHALL classify the failure with evidence, into exactly one cause from `A` to `I`, given the attempt history:
- `A`: the tests are wrong;
- `B`: the design's premise is false;
- `C`: the issue is too big;
- `D`: the fix list is complete and exact;
- `E`: it needs a human decision;
- `F`: implementer and reviewer dispute a finding;
- `G`: other;
- `H`: the harness is at fault;
- `I`: the reviewers contradict each other.

#### Scenario: Two failed attempts
- **WHEN** `code-review-1` and `code-review-2` both return `DO_NOT_SHIP`
- **THEN** `diagnose-1` runs with both attempts' commits, verdicts and findings

### Requirement: Routing on a cause
The run SHALL route on an implement stop cause or a diagnosis:
- `A`: a new acceptance step with the note, its review, then a new implement loop;
- `B` and `G`: a new design step with the note, then both reviews, acceptance and a new loop;
- `C`: end the run `too_big`;
- `D`: one more attempt, once per loop;
- `E`: wait for an answer, then a new design step with it;
- `F`: a tie-break reviewer;
- `H` and `I`: end the run `parked`.

#### Scenario: Wrong tests
- **WHEN** an implement attempt stops with cause `A`
- **THEN** `acceptance-2` runs with the note, then `tests-review-2`, then a new implement loop whose first attempt uses the ladder's first profile

#### Scenario: One more attempt
- **WHEN** the diagnosis is `D`
- **THEN** one more attempt runs. If it also fails, the run ends `escalated` with cause `attempts_exhausted`

#### Scenario: Harness defect
- **WHEN** the diagnosis is `H`
- **THEN** the run ends `parked` with the diagnosis' evidence

### Requirement: Tie-break on a dispute
On diagnosis `F`, a tie-break reviewer SHALL grade the last attempt's commit. If its `SHIP` brings the attempt's `SHIP` count up to the number of reviewers the risk requires, the attempt passes; otherwise the run routes as `B`.

#### Scenario: Tie-break ships
- **WHEN** a high-risk attempt got one `SHIP` and one `DO_NOT_SHIP`, the diagnosis is `F`, and the tie-break returns `SHIP`
- **THEN** the attempt passes and the run goes to finish with outcome `ready`

### Requirement: Limited routes back
A run SHALL route back to design or acceptance at most twice. A third route back SHALL end the run `escalated` with cause `bounces_exhausted`.

#### Scenario: Third bounce
- **WHEN** the run has already routed back twice and a third route back is due
- **THEN** the run ends `escalated` with cause `bounces_exhausted`

### Requirement: A waiting run holds no pod
When a step exits `needs_input`, the run SHALL:
1. delete the step's pod and keep its PVC;
2. wait for an `answer` signal, with no timeout;
3. start a new pod on the same PVC, pass the answer to the adapter and follow the step again.

A diagnosis `E` SHALL wait for the same signal.

#### Scenario: Answer resumes the step
- **WHEN** `implement-1` asks a question and the user answers it
- **THEN** a new pod `f8-<runId>-implement-1` starts on the same PVC, and the step continues its session with the answer

#### Scenario: Waiting
- **WHEN** the run is waiting for an answer
- **THEN** none of its pods exist

### Requirement: Finish step
Every run that opened a PR SHALL end with a finish step that posts the run's report on the PR:
- the outcome;
- each step's model and result;
- the causes;
- the non-blocking findings, as follow-ups.

It SHALL mark the PR ready for review only when the outcome is `ready`. A run that ends before a PR exists SHALL post its report on the issue.

#### Scenario: Escalated run
- **WHEN** a run ends `escalated`
- **THEN** the finish step posts the report on the PR, and the PR stays a draft

### Requirement: Run outcome
A run SHALL succeed only with outcome `ready`, returning the PR's URL. Any other outcome (`escalated`, `too_big`, `parked`) SHALL fail the run after the finish step: the outcome is the failure's type, and the cause and note are its message. A step that exits `failed` SHALL fail the run at once, with the step and the reason.

#### Scenario: Step failure
- **WHEN** the adapter reports `failed` for `acceptance-1`
- **THEN** the run fails at once with `acceptance-1` and the adapter's reason, and its sandbox's pod is deleted

### Requirement: Run state query
The run SHALL answer a `state` query with:
- its current stage and attempt;
- the risk;
- the PR;
- the open question, while it waits;
- every finished step's stage, model and result.

#### Scenario: Query mid-run
- **WHEN** the `state` query reaches a run in its second implement attempt
- **THEN** it returns the stage `implement-2`, the PR, the risk, and the results of every earlier step

### Requirement: Models per stage
A run SHALL read the installation's `F8_BANDS` setting once, when it starts:
- one profile (model, optional effort) each for design, acceptance, review, diagnose and finish;
- a list of profiles for implement.

The run SHALL fail at its start when any of them is missing, or when the review or diagnose model is a design, acceptance or implement model (DEP-11).

#### Scenario: Reviewer on an author's model
- **WHEN** `F8_BANDS` gives review the same model as one implement profile
- **THEN** the run fails before any sandbox starts, naming that model

### Requirement: Agents never merge
No step SHALL merge the PR or push to the default branch. The human merges or not in GitHub, and nothing in the run waits on that decision (G4, DEP-2).

#### Scenario: Ready run
- **WHEN** a run ends `ready`
- **THEN** the PR is open, ready for review and unmerged
