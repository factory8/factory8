# Tasks

Dogfooded: each task becomes a GitHub issue and runs through `f8 run <issue>`.

## 4. M4: recovery

- [ ] 4.1 Stall → retry, then escalate (ORC-4, ORC-13; after 2.2). Done when: a step with no progress past its timeout is cancelled and retried on the same PVC, resuming the session with "continue"; after the last attempt, the run escalates on the issue
- [ ] 4.2 Sandbox pod death → retry (after 1.8). Done when: deleting the pod mid-step leads to a retry with a new pod on the same PVC
- [ ] 4.3 Fault-injection test (after 4.1, 4.2). Done when: a script forces a failure, a stall and a pod kill on a real run, and the run still finishes
- [ ] 4.4 Cleanup at run end (SBX-15; after 3.2). Done when: at run end or cancel, the sandbox's pod is deleted and the run's PVC is kept
