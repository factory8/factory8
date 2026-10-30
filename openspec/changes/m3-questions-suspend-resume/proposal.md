# M3: questions with suspend/resume

## Why

In M1, a run fails when the agent asks a question. M3 lets the run wait for a human answer without holding a pod, then continue the same agent session (PRD §8 M3; SBX-11–13, ORC-5).

## What Changes

- M6 builds the core of this for its ship run: on `needs_input` the workflow deletes the pod, keeps the PVC, waits for an `answer` signal and resumes the step, and `f8 answer` sends the signal. M3's task 3.2 makes M5's run wait the same way, and 3.4 now belongs to M6.
- On `needs_input`, the workflow posts the question on the issue, suspends the sandbox (deletes its pod, keeps its PVC) and waits for a signal. When the signal arrives, it starts a new pod on the same PVC, POSTs `/answer` to the adapter and polls again.
- `/answer` on the issue sends the signal; only the owner's comments count.
- `f8 answer <run> "<text>"` sends the same signal.
- Spike first: suspend/resume on Kata + NFS (A8, A9) decides the design.

Open for M3's design: posting the question on the issue and polling for `/answer` are forge work, and the worker does none (M1 design D1). M3 decides who does them, for example the agent posting its own question with `gh`, plus a separate comment poller.

Specs and design are written after the spike (3.1). Until then this proposal and tasks.md hold the plan.

## Capabilities

### New Capabilities
- `forge-commands`: commands given as issue comments, polled like intake (ART-6); M3 adds `/answer`.

### Modified Capabilities
- `run-workflow`: `needs_input` waits for an answer instead of failing the run.
- `f8-cli`: `f8 answer`.

## Impact

- `worker/` and `cli/`. Suspend and resume are pod deletes and creates (M1 design D2); no sandbox controller.
