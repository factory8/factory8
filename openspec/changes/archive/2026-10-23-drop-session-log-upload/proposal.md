# Drop the session-log upload

## Why

AGT-11 changed on 2026-10-23: session logs stay on the run's volume instead of being uploaded to object storage. The session files are already on the PVC, because `/f8/home` is the CLI's `$HOME`. Claude Code 2.1.289 resumes a session from its `.jsonl` file alone, even in a fresh home directory and from another working directory, so restoring needs no store. The upload also needed a store that M1 doesn't have (M1 design D1).

## What Changes

- **BREAKING** for callers: `StepRequest` and the answer request lose `logsUploadUrl`.
- The adapter no longer packs and PUTs `/f8/state` and `/f8/home/.claude/projects` on exit; those files on the PVC are the step's session logs.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `agent-adapter`: no `logsUploadUrl`, no upload on exit; the files on the PVC are the session logs.

## Impact

- `adapter/src/main.ts` and `adapter/test/adapter.test.ts`. No other callers yet: the worker comes with M1.
