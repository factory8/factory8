# Spec Delta

## MODIFIED Requirements

### Requirement: Start a step
`POST /steps` with a `StepRequest` SHALL answer `202` and start the step. The request carries:
- `stepId` (`${runId}.${step}.${attempt}`) and `runId`;
- the vendor-neutral task prompt;
- `profile` (`vendor: claude-code`, `model`, optional `effort`);
- `repo` (https `url`, `branch`);
- optionally, `plugin`: the https `url` of a repo holding a Factory8 plugin, and `at`, an ISO time.

#### Scenario: Incomplete request
- **WHEN** a required field is missing
- **THEN** the adapter answers `400` and starts nothing

#### Scenario: Repeated start
- **WHEN** a worker repeats `POST /steps` for the `stepId` it already holds
- **THEN** the adapter answers `202` and starts nothing, so activity retries are safe

### Requirement: Headless CLI run
The adapter SHALL run `claude -p --output-format stream-json --verbose --dangerously-skip-permissions --model <model>` in `/f8/work`, with `HOME=/f8/home` and `IS_SANDBOX=1`. It adds:
- `--effort` when the profile has one;
- `--append-system-prompt` with the protocol preamble;
- `--plugin-dir` when the step loads a plugin.

Permission checks are always skipped: the agent is root in the sandbox, which is the boundary (BLD-6). The task prompt alone goes on stdin, so it can start with a slash command.

#### Scenario: Fresh session
- **WHEN** a step starts and no session is recorded
- **THEN** stdin holds the task prompt alone, and the preamble is appended to the system prompt

#### Scenario: Slash command
- **WHEN** a step's prompt is `/factory8:review 12 mode=code pr=18 sha=abc123` and it loads the plugin
- **THEN** Claude Code runs the plugin's `review` skill with those arguments

### Requirement: Protocol preamble
Every session's system prompt, fresh or resumed, SHALL end with: "You are working in `/f8/work` on branch `<branch>`. Commit and push your work before you finish. If you need a decision only a human can make, run `f8-ask "<question>"` and stop; don't guess. Finish with a short summary of what you did."

#### Scenario: Branch named
- **WHEN** a step starts on branch `factory8/abc123`
- **THEN** the preamble names `factory8/abc123` as the branch to push

### Requirement: Filesystem layout
The PVC SHALL be mounted at `/f8` (SBX-12):
- `/f8/work` holds the checkout;
- `/f8/home` is the CLI's `$HOME`;
- `/f8/state` holds `request.json`, `events.jsonl`, `session`, `question.md` and `handoff.md`;
- `/f8/plugin` holds the plugin's checkout.

The vendor session files (`/f8/home/.claude/projects`) and `/f8/state` are the step's session logs. They stay on the PVC and are not uploaded (AGT-11). Nothing secret is written under `/f8`.

#### Scenario: Secrets stay in the environment
- **WHEN** a step runs with the POC Secret
- **THEN** the token and key reach git and the CLI only as environment variables, and no file under `/f8` holds them

#### Scenario: Step exits
- **WHEN** a step exits with any status
- **THEN** its session `.jsonl` and `/f8/state` are on the PVC, and nothing is sent anywhere

## ADDED Requirements

### Requirement: Plugin as of a point in time
When a `StepRequest` names a plugin, the adapter SHALL, before the CLI starts:
1. clone the plugin's repo into `/f8/plugin`, or fetch it if it's already there;
2. check out the last first-parent commit of the repo's default branch made at or before `at`;
3. load that checkout's `plugin/` directory into the CLI.

Git authenticates as it does for the run branch. If any of this fails, the step SHALL exit `failed` with the git error.

#### Scenario: Pinned to the run's start
- **WHEN** a commit lands on the plugin repo's default branch after `at`
- **THEN** the step loads the commit before it

#### Scenario: No plugin
- **WHEN** a `StepRequest` has no `plugin`
- **THEN** nothing is cloned into `/f8/plugin`, and the CLI runs without `--plugin-dir`
