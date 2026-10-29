# M5: the SDLC run (plan → build → review → ready PR)

## Why

M1's run is one agent step: whatever the agent produces becomes a draft PR that nobody has checked, and there's no plan to check it against. M5 makes a run follow the playbook's chain: plan, build with tests, an independent review and fixes. The run ends with a PR ready for the human to merge or not, so the human's time goes to the one gate that matters (G1, G2, G6).

**Each step runs in its own sandbox.** A reviewer that shares the author's session, handoff note or working tree reviews with the author's assumptions, so the review would be worth little. Isolated steps meet only through git and the PR, as PRD §7 has it ("the next stage starts fresh from git … and carries no hidden transcript state"). The reviewer also runs on a different model from the author (DEP-11).

M5 comes right after 1.8, before M2–M4, so their heartbeats, questions and retries apply to a multi-step run from the start. It pulls the plan step (BLD-1) and the PR review step (DEP-1) from Phase 1 into Phase 0, without the human gates in between.

## What Changes

- **`f8 run <issue>` starts the SDLC run** instead of M1's one-step run. The issue is the intent (ART-1); there's no intake, triage or `/accept` (INT, Phase 1).
- **A sandbox per step:** each step gets a new pod and a new PVC, `f8-<runId>-<stage>`, and its pod is deleted when the step ends. A step sees earlier steps' work only on the run branch and the PR, never their sessions, handoff notes or uncommitted files.
- **Stages:**
  1. **plan:** commits `plan.md` (files that change, order of work, risks, proof) to the run branch, changes no code, and opens the draft PR (BLD-1, ART-1).
  2. **build:** implements the plan, runs the repo's checks and pushes. If the work departs from the plan, it updates `plan.md` in the same commit (BLD-2). Test isn't a separate stage: the build step's own feedback loop covers it (TST-1, TST-2 in their Phase 0 form).
  3. **review:** runs on the installation's reviewer model, which differs from the author's (DEP-11). It checks the PR against the issue and `plan.md`, treating the PR's description and commit messages as claims to verify. It runs the checks and posts severity-ranked findings as a PR review comment (DEP-1), then ends with a verdict.
  4. **fix:** addresses the review's important findings, then review runs again. There are at most 2 fix rounds (ORC-3).
- **The run ends at the human gate.** When the review verdict is `ready`, the reviewer marks the PR ready for review and the run succeeds with its summary. If the review still asks for changes after the last fix round, the PR stays a draft and the run fails with `changes_requested`. No agent merges, ever (G4, DEP-2): the human merges or not in GitHub, and nothing waits on that decision.
- **A new worker setting, `F8_REVIEW_MODEL`:** the worker refuses to start without it, or when it equals `F8_MODEL`.
- M1's one-step `runWorkflow` is replaced; its step logic is reused for each stage. The adapter is unchanged: a new PVC has no recorded session, so every step starts fresh.

Not in M5: human gates before build (they need M3's signals), spec.md and intent.md stages, routes (ORC-11), a reviewer on a different vendor (AGT-8), artifact front-matter (ART-2), a fix loop driven by the human's PR comments (DEP-3), and evidence upload (ART-12).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `run-workflow`: a run is the plan → build → review/fix sequence, each step in its own sandbox, ending with the PR ready or `changes_requested`. Added in M1's change; M1 must be archived before this one.
- `sandbox`: a sandbox and a PVC per step, not per run. Added in M1's change, as above.
- `project-detection`: review steps use the installation's reviewer model, and every other step the default. Added in M1's change, as above.
- `f8-cli`: `f8 run` starts the SDLC run and prints the final review's summary. Added in M1's change, as above.

## Impact

- `worker/src/workflows.ts`: `sdlcWorkflow` replaces `runWorkflow`. The stage prompts move to `worker/src/prompts.ts`, out of the CLI's `taskPrompt`.
- `worker/src/activities.ts`: sandboxes are named per step, and `startStep` picks the model by role. `worker/src/main.ts` checks `F8_REVIEW_MODEL`.
- `cli/src/main.ts`, `cli/src/run.ts`: `f8 run` starts `sdlcWorkflow({ runId, repo, issue })`.
- `deploy/worker.yaml`: `F8_REVIEW_MODEL` and the new worker image tag. The sandbox image is unchanged.
- The pilot cluster: LiteLLM serves the reviewer model (*user*). A run leaves up to 7 PVC directories on the share, deleted by hand until retention (ART-10).
- Docs: PRD §0 row and §8 (Phase 0 gains M5, Phase 1 loses the plan and review steps), `docs/site/prd.html` and `architecture.html`, and `docs/plans/poc.md` (milestones, exit criterion).
- Merging an M5 PR also merges its `plan.md` into the default branch.
