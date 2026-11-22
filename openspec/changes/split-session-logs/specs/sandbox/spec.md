# Spec Delta

## MODIFIED Requirements

### Requirement: Workspace volume
Each step of a run SHALL get its own PVC, named `factory8-<runId>-<stage>` (e.g. `factory8-k3x9qa-review-1`), of the StorageClass `factory8-workspace`, mounted at `/f8` and laid out as the `agent-adapter` spec says (SBX-12). A later attempt of the same step reuses its PVC. The PVC SHALL be deleted when its step ends, whatever the outcome, and kept while the step waits on a human (SBX-11). The sandbox is a plain pod; no sandbox controller is involved (SBX-1).

#### Scenario: Volume mounted
- **WHEN** the sandbox's pod starts
- **THEN** `/f8` is a PVC of the class `factory8-workspace` that belongs to this step only

#### Scenario: Step ends
- **WHEN** a step exits `done` or `failed`
- **THEN** its pod is deleted, then its PVC, and the PVC's storage is freed

#### Scenario: Step waits on a question
- **WHEN** a step exits `needs_input`
- **THEN** its pod is deleted and its PVC is kept, and the step resumes on it after the answer

### Requirement: Session logs outlive the sandbox
Each step's session logs, the agent's session `.jsonl` files and the adapter's state, SHALL be written to the session-log volume: one ReadWriteMany PVC, `factory8-sessions`, in the sandboxes' namespace. Each step's are in a folder named `<runId>-<stage>`, and only that step's sandbox mounts it. They SHALL stay there after the step's PVC is deleted, after the run and the step (AGT-11, SBX-15). Retention is not in the POC.

#### Scenario: Restore a finished step's session
- **WHEN** a run has ended and its steps' PVCs are deleted
- **THEN** each step's session file is on the session-log volume, and copied into `~/.claude/projects/` it resumes with `claude --resume <id>`

#### Scenario: A step sees only its own folder
- **WHEN** `review-1` runs after `build` in the same run
- **THEN** its sandbox sees only the `<runId>-review-1` folder of the log volume, and none of `build`'s files

#### Scenario: What a reader sees
- **WHEN** a pod in the sandboxes' namespace mounts `factory8-sessions` read-only
- **THEN** each step is a folder `<runId>-<stage>` holding `projects/<encoded-cwd>/<uuid>.jsonl`, with subagents under `<uuid>/subagents/`, and `state/`
