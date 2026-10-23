# agent-adapter Specification

## Purpose

`f8-adapter` runs one agent step at a time inside a sandbox. Workers start steps, follow their events and answer questions through its HTTP API; vendor CLI specifics (flags, session dirs) live only here (AGT-1, AGT-9–11, SBX-11–13, ORC-13). Phase 0 supports Claude Code.

## Requirements

### Requirement: One step at a time over HTTP
`f8-adapter serve` SHALL be the sandbox's main process, serving HTTP on port 7070, and SHALL run at most one step at a time, with the agent CLI as its child, so a worker restart drops a poll, not the agent. It has no auth of its own: the agent is root in the same VM, so a NetworkPolicy admitting only workers is the boundary (SBX-3; not in the POC).

#### Scenario: Second step while one runs
- **WHEN** a worker POSTs `/steps` with a new `stepId` while another step's CLI is running
- **THEN** the adapter answers `409` and the running step continues

### Requirement: Start a step
`POST /steps` with a `StepRequest` SHALL answer `202` and start the step. The request carries `stepId` (`${runId}.${step}.${attempt}`), `runId`, the vendor-neutral task prompt, `profile` (`vendor: claude-code`, `model`, optional `effort`) and `repo` (https `url`, `branch`).

#### Scenario: Incomplete request
- **WHEN** a required field is missing
- **THEN** the adapter answers `400` and starts nothing

#### Scenario: Repeated start
- **WHEN** a worker repeats `POST /steps` for the `stepId` it already holds
- **THEN** the adapter answers `202` and starts nothing, so activity retries are safe

### Requirement: Checkout of the run branch
Before the CLI starts, the adapter SHALL clone or fetch the repo into `/f8/work`, switch to the run branch (creating it if new) and install a `commit-msg` hook that adds the trailer `Factory8-Run: <runId>` (ART-3). Git authenticates with `GH_TOKEN` from the environment.

#### Scenario: Agent commits
- **WHEN** the agent commits on the run branch
- **THEN** the commit message ends with `Factory8-Run: <runId>`

#### Scenario: Checkout fails
- **WHEN** the clone, fetch or switch fails
- **THEN** the step exits `failed` with the git error as its reason

### Requirement: AGENTS.md as Claude Code context
If the checkout has `AGENTS.md` but no `CLAUDE.md`, the adapter SHALL write `/f8/work/CLAUDE.md` containing `@AGENTS.md` and list it in `.git/info/exclude`, so it is never committed (AGT-4).

#### Scenario: Repo with AGENTS.md only
- **WHEN** a step starts on a repo that has `AGENTS.md` and no `CLAUDE.md`
- **THEN** Claude Code loads `AGENTS.md` through the generated `CLAUDE.md`, and `git status` shows no new file

### Requirement: Headless CLI run
The adapter SHALL run `claude -p --output-format stream-json --verbose --dangerously-skip-permissions --model <model>` (plus `--effort` when given) in `/f8/work`, with `HOME=/f8/home` and `IS_SANDBOX=1`. Permission checks are always skipped: the agent is root in the sandbox and decides on its own what to do, since the sandbox is the boundary (BLD-6). The prompt goes on stdin: the protocol preamble, then the task prompt.

#### Scenario: Fresh session
- **WHEN** a step starts and no session is recorded
- **THEN** stdin holds the preamble and then the task prompt

### Requirement: Protocol preamble
Every fresh session's prompt SHALL start with: "You are working in `/f8/work` on branch `<branch>`. Commit and push your work before you finish. If you need a decision only a human can make, run `f8-ask "<question>"` and stop; don't guess. Finish with a short summary of what you did."

#### Scenario: Branch named
- **WHEN** a step starts on branch `f8/abc123`
- **THEN** the preamble names `f8/abc123` as the branch to push

### Requirement: Progress events
Each tool call in the CLI's stream SHALL become a `progress` event whose text is the tool name and its main argument (first line, at most 200 characters), appended to `/f8/state/events.jsonl`. Every event has a `seq` that increases across steps and an ISO `at` time.

#### Scenario: Agent runs a command
- **WHEN** the agent calls Bash with `npm test`
- **THEN** a `progress` event with text `Bash: npm test` is emitted

### Requirement: Exit status
When the CLI ends, the adapter SHALL emit one `exit` event: `failed` with reason `cancelled` after a cancel; else `needs_input` with the question if `/f8/state/question.md` exists; else `done` with the agent's final message if the exit code is 0 (the claim is trusted; the agent pushed its own work); else `failed` with the exit code and the last stderr lines.

#### Scenario: Agent finishes
- **WHEN** the CLI exits 0 and no question was recorded
- **THEN** the step exits `done` with the agent's final message as `summary`

#### Scenario: CLI crashes
- **WHEN** the CLI exits non-zero
- **THEN** the step exits `failed` with the exit code and the last stderr lines as `reason`

### Requirement: Long-poll events
`GET /steps/{stepId}/events?after=<seq>` SHALL return `{ events }` holding that step's events after `seq`, waiting up to 30 s when there are none. An unknown `stepId` SHALL get `404`.

#### Scenario: Nothing new
- **WHEN** a worker polls and no event arrives within 30 s
- **THEN** the adapter answers `200` with an empty list

### Requirement: Questions through f8-ask
`f8-ask "<question>"`, on the sandbox's `PATH`, SHALL write the question to `/f8/state/question.md` and print: "Recorded. A human will answer later. Write your handoff note to /f8/state/handoff.md, then end your turn." Every CLI asks this way (SBX-11, A15); no vendor hooks are used.

#### Scenario: Agent asks
- **WHEN** the agent runs `f8-ask` and ends its turn
- **THEN** the step exits `needs_input` with the question

### Requirement: Answer resumes the step
`POST /steps/{stepId}/answer` with `{ answer }` SHALL answer `202` and continue a step whose last event is `needs_input`: it resumes the recorded session with the answer, or, if there is none or the resume doesn't start, runs a fresh session whose prompt adds the handoff note, the question and the answer. Otherwise it SHALL answer `409`.

#### Scenario: Resume fails
- **WHEN** `claude --resume` exits without starting the session
- **THEN** the adapter runs a fresh session with the handoff note, the question and the answer after the task prompt

#### Scenario: Not waiting
- **WHEN** an answer arrives for a step that did not exit `needs_input`
- **THEN** the adapter answers `409`

### Requirement: State survives a pod restart
The adapter SHALL keep the request, the events and the vendor session id under `/f8/state` and reload them when it starts. A step started on a PVC with a recorded session SHALL resume that session with "continue" (retry on the same PVC, ORC-13).

#### Scenario: Retry after sandbox death
- **WHEN** a new pod mounts the PVC and a worker starts the step's next attempt
- **THEN** the adapter resumes the recorded session with "continue"

### Requirement: Cancel
`POST /steps/{stepId}/cancel` SHALL stop the running CLI; the step then uploads its logs and exits `failed` with reason `cancelled`. It SHALL answer `202` even when nothing is running.

#### Scenario: Cancel a running step
- **WHEN** a worker cancels a running step
- **THEN** the CLI gets SIGTERM, and after the log upload the step exits `failed` with reason `cancelled`

### Requirement: Filesystem layout
The PVC SHALL be mounted at `/f8` (SBX-12): `/f8/work` holds the checkout, `/f8/home` is the CLI's `$HOME`, `/f8/state` holds `request.json`, `events.jsonl`, `session`, `question.md` and `handoff.md`. The vendor session files (`/f8/home/.claude/projects`) and `/f8/state` are the step's session logs; they stay on the PVC and are not uploaded (AGT-11). Nothing secret is written under `/f8`.

#### Scenario: Secrets stay in the environment
- **WHEN** a step runs with the POC Secret
- **THEN** the token and key reach git and the CLI only as environment variables, and no file under `/f8` holds them

#### Scenario: Step exits
- **WHEN** a step exits with any status
- **THEN** its session `.jsonl` and `/f8/state` are on the PVC, and nothing is sent anywhere
