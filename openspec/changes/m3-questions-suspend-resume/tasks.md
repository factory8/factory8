# Tasks

Dogfooded, except the spike, which is done by hand.

## 3. M3: questions with suspend/resume

- [ ] 3.1 Spike: suspend/resume on Kata + NFS (A8, A9), by hand. Run it early, because it decides the M3 design (after 1.4). Done when: after deleting a sandbox's pod mid-session and starting a new one on the same PVC, `claude --resume` continues the session; the time to Ready is measured; `f8-ask` is compared with kagent's way of asking (a PreToolUse hook defers `AskUserQuestion`, then `--resume` feeds in the answer), which needs a vendor hook that A15 rules out
- [ ] 3.2 Workflow waits on `needs_input` (SBX-11–13, ORC-5; after 3.1, 1.8). Done when: it posts the question on the issue, suspends the sandbox and waits for a signal; when the signal arrives, it resumes the sandbox, POSTs `/answer` and polls again
- [ ] 3.3 `/answer` on the issue (after 3.2). Done when: an owner-only comment poller sends the signal
- [ ] 3.4 `f8 answer <run> "<text>"` (after 3.2). Done when: it sends the same signal
