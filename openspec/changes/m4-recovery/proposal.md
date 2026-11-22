# M4: recovery

## Why

A stalled step or a dead sandbox must not leave a run hanging. M4 retries it, then escalates to a human, and cleans up at run end (PRD §8 M4; ORC-4, ORC-13, SBX-15).

## What Changes

- A step with no progress past its `progressTimeout` is cancelled and retried on the same PVC, which resumes the session with "continue". After the last attempt, the run escalates on the issue.
- Deleting the pod mid-step leads to a retry with a new pod on the same PVC.
- A fault-injection script forces a failure, a stall and a pod kill on a real run.
- At run end or cancel, the current step's pod (a suspended sandbox has none) and its PVC are deleted, as when a step ends; its session logs stay on the session-log volume (SBX-15, AGT-11; split-session-logs). Retries stay within a step, on the same PVC.

Specs and design are written when M4 starts. Until then this proposal and tasks.md hold the plan.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `run-workflow`: retries on stall and sandbox death, escalation, and cleanup at run end.

## Impact

- `worker/`, plus a fault-injection script.
