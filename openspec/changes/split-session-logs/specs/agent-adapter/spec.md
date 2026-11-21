# Spec Delta

## MODIFIED Requirements

### Requirement: State survives a pod restart
The adapter SHALL keep the request, the events and the vendor session id under `/f8-logs/state` and reload them when it starts. A step started with a recorded session SHALL resume that session with "continue" (retry on the same PVC, ORC-13).

#### Scenario: Retry after sandbox death
- **WHEN** a new pod mounts the step's PVC and its folder of the log volume, and a worker starts the step's next attempt
- **THEN** the adapter resumes the recorded session with "continue"

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
