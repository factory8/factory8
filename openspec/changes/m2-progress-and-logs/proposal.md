# M2: live progress and session logs

## Why

After M1, a run says nothing until it ends. M2 shows a run's progress while it works, and checks that a finished run's session can be restored from its logs (PRD §8 M2; ORC-13, AGT-11, PLT-5).

## What Changes

- Session logs are kept on the session-log volume, a folder per step, after the step's PVC is deleted (AGT-11; split-session-logs). M2 checks that a finished step's session restores from them.
- The poll activity heartbeats Temporal with the step's latest progress. The heartbeat timeout is `progressTimeout`, a workflow setting that defaults to 10 min (ORC-13).
- `f8 runs` lists runs with their stage and latest progress, and `f8 watch <run>` follows one live. Both support `--json` (PLT-5).
- One status comment on the PR is edited as the run progresses (ORC-13).

Open for M2's design: **the PR status comment is forge work,** and the worker does none (M1 design D1). Who edits the comment is decided in M2's design.

Specs and design are written when M2 starts, after 1.8. Until then this proposal and tasks.md hold the plan.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `run-workflow`: heartbeats with progress, and the PR status comment.
- `f8-cli`: `f8 runs` and `f8 watch`.

## Impact

- `worker/` and `cli/`.
