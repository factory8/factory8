## MODIFIED Requirements

### Requirement: Start a step
`POST /steps` with a `StepRequest` SHALL answer `202` and start the step. The request carries `stepId` (`${runId}.${step}.${attempt}`), `runId`, the vendor-neutral task prompt, `profile` (`vendor: claude-code`, `model`, optional `effort`) and `repo` (https `url`, `branch`).

#### Scenario: Incomplete request
- **WHEN** a required field is missing
- **THEN** the adapter answers `400` and starts nothing

#### Scenario: Repeated start
- **WHEN** a worker repeats `POST /steps` for the `stepId` it already holds
- **THEN** the adapter answers `202` and starts nothing, so activity retries are safe

### Requirement: Answer resumes the step
`POST /steps/{stepId}/answer` with `{ answer }` SHALL answer `202` and continue a step whose last event is `needs_input`: it resumes the recorded session with the answer, or, if there is none or the resume doesn't start, runs a fresh session whose prompt adds the handoff note, the question and the answer. Otherwise it SHALL answer `409`.

#### Scenario: Resume fails
- **WHEN** `claude --resume` exits without starting the session
- **THEN** the adapter runs a fresh session with the handoff note, the question and the answer after the task prompt

#### Scenario: Not waiting
- **WHEN** an answer arrives for a step that did not exit `needs_input`
- **THEN** the adapter answers `409`

### Requirement: Filesystem layout
The PVC SHALL be mounted at `/f8` (SBX-12): `/f8/work` holds the checkout, `/f8/home` is the CLI's `$HOME`, `/f8/state` holds `request.json`, `events.jsonl`, `session`, `question.md` and `handoff.md`. The vendor session files (`/f8/home/.claude/projects`) and `/f8/state` are the step's session logs; they stay on the PVC and are not uploaded (AGT-11). Nothing secret is written under `/f8`.

#### Scenario: Secrets stay in the environment
- **WHEN** a step runs with the POC Secret
- **THEN** the token and key reach git and the CLI only as environment variables, and no file under `/f8` holds them

#### Scenario: Step exits
- **WHEN** a step exits with any status
- **THEN** its session `.jsonl` and `/f8/state` are on the PVC, and nothing is sent anywhere

## REMOVED Requirements

### Requirement: Session logs on every exit
**Reason**: AGT-11 now keeps session logs on the run's volume; the upload needed a store the POC doesn't have.
**Migration**: none; no caller sends `logsUploadUrl` yet. Read the session files from the run's PVC.
