# Spec Delta

## MODIFIED Requirements

### Requirement: State survives a pod restart
The adapter SHALL keep the request, the events and the vendor session id under `/f8-logs/state` and reload them when it starts. A step started with a recorded session SHALL resume that session with "continue" (retry on the same PVC, ORC-13).

#### Scenario: Retry after sandbox death
- **WHEN** a new pod mounts the step's PVC and its folder of the log volume, and a worker starts the step's next attempt
- **THEN** the adapter resumes the recorded session with "continue"

### Requirement: Progress events
Each tool call in the CLI's stream SHALL become a `progress` event whose text is the tool name and its main argument (first line, at most 200 characters), appended to `/f8-logs/state/events.jsonl`. Every event has a `seq` that increases across steps and an ISO `at` time.

#### Scenario: Agent runs a command
- **WHEN** the agent calls Bash with `npm test`
- **THEN** a `progress` event with text `Bash: npm test` is emitted

### Requirement: Exit status
When the CLI ends, the adapter SHALL emit one `exit` event: `failed` with reason `cancelled` after a cancel; else `needs_input` with the question if `/f8-logs/state/question.md` exists; else `done` with the agent's final message if the exit code is 0 (the claim is trusted; the agent pushed its own work); else `failed` with the exit code and the last stderr lines.

#### Scenario: Agent finishes
- **WHEN** the CLI exits 0 and no question was recorded
- **THEN** the step exits `done` with the agent's final message as `summary`

#### Scenario: CLI crashes
- **WHEN** the CLI exits non-zero
- **THEN** the step exits `failed` with the exit code and the last stderr lines as `reason`

### Requirement: Questions through f8-ask
`f8-ask "<question>"`, on the sandbox's `PATH`, SHALL write the question to `/f8-logs/state/question.md` and print: "Recorded. A human will answer later. Write your handoff note to /f8-logs/state/handoff.md, then end your turn." Every CLI asks this way (SBX-11, A15); no vendor hooks are used.

#### Scenario: Agent asks
- **WHEN** the agent runs `f8-ask` and ends its turn
- **THEN** the step exits `needs_input` with the question

### Requirement: Filesystem layout
The step's PVC SHALL be mounted at `/f8` (SBX-12), and the step's folder of the session-log volume at `/f8-logs` (`sandbox` spec):
- `/f8/<owner>/<repo>` holds the checkout, and `/f8/.clone` holds a fresh clone until its checkout path is known;
- `/f8/home` is the CLI's `$HOME`, and `/f8/home/.claude/projects` is a link to `/f8-logs/projects`;
- `/f8-logs/state` holds `request.json`, `events.jsonl`, `session`, `checkout`, `question.md` and `handoff.md`;
- `/f8/plugin` holds the plugin's checkout.

The vendor session files (`/f8-logs/projects`) and `/f8-logs/state` are the step's session logs. They are written to the log volume as they are written, and are not uploaded (AGT-11). Nothing secret is written under `/f8` or `/f8-logs`.

#### Scenario: Secrets stay in the environment
- **WHEN** a step runs with the POC Secret
- **THEN** the token and key reach git and the CLI only as environment variables, and no file under `/f8` or `/f8-logs` holds them

#### Scenario: Session written to the log volume
- **WHEN** Claude Code writes a turn of the step's session
- **THEN** the turn is in `/f8-logs/projects/<encoded-cwd>/<uuid>.jsonl`, through the link

#### Scenario: Step exits
- **WHEN** a step exits with any status
- **THEN** its session `.jsonl` and its state are under `/f8-logs`, and nothing is sent anywhere
