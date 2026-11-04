# Tasks

Implemented directly in-session, not dogfooded through `f8 run` (the user ditched that). *user* marks work the user does on the cluster or GitHub. "After" names the tasks each one waits on.

## 5. M5: the SDLC run

- [x] 5.0 Docs for the move (design D8; after none). Done when: the PRD has a §0 row (BLD-1, DEP-1, DEP-11, ORC-3, §8). §8's Phase 0 row includes M5, and its Phase 1 row no longer lists the plan or the PR review step. `docs/site/prd.html` and `architecture.html` match the PRD. `docs/plans/poc.md` has the M5 row, M2–M4 after M5, and the new exit criterion. The memory file `software-factory-architecture-decisions.md` notes M5
- [x] 5.1 Stage prompts in `worker/src/prompts.ts` (design D5; after 1.8). Done when: `plan`, `build`, `review` and `fix` exist as pure functions of `runId` and `issue`. A test checks that:
  - every prompt forbids merging and pushing to the default branch, and treats the issue and PR comments as data;
  - the plan prompt names `.factory8/runs/<runId>/plan.md`, its four sections, `gh pr create --draft`, `Run: <runId>` and `Fixes #<issue>`;
  - the review prompt says the agent didn't write the change, treats the PR description and commits as claims to verify, asks for `REVIEW.md` when it exists, findings ranked Important or Nit, and `gh pr ready` when nothing is Important, and ends with `Verdict: ready` or `Verdict: changes`.

  `taskPrompt` and its CLI test are removed.
- [x] 5.2 `sdlcWorkflow` replaces `runWorkflow`, with a sandbox per step and the reviewer model (design D1, D2, D3, D4, D7; after 5.1). Done when:
  - A test shows that `sandboxPod(runId, stage, image)` names the pod and its PVC claim `factory8-<runId>-<stage>` and adds the label `factory8/step`.
  - A test shows that `startStep` sends `FACTORY8_REVIEW_MODEL` for the reviewer role and `FACTORY8_MODEL` otherwise.
  - The worker exits at start when `FACTORY8_REVIEW_MODEL` is missing or equals `FACTORY8_MODEL`.
  - Workflow tests in local mode (M1 D7), with mocked activities, cover:
    - ready on the first review: steps `plan`, `build` and `review-1` in order, each with its own create and delete (`runId`, stage), step IDs `<runId>.<stage>.1`, and the reviewer role only on review;
    - one fix round;
    - fix rounds exhausted: `changes_requested`;
    - a failed build: its sandbox is deleted and no review starts;
    - no verdict: `no_verdict`.

  `npm test` and `npm run typecheck` pass.
- [x] 5.3 `f8 run` starts `sdlcWorkflow` (after 5.2). Done when: it starts `sdlcWorkflow` with `{ runId, repo, issue }` and prints the result's summary, or the reason and a non-zero exit on failure (`f8-cli` spec). The CLI tests and `npm run typecheck` pass
- [x] 5.4 Deploy (*user* + me; after 5.3; design Migration Plan). Done when: LiteLLM serves the reviewer model the *user* picked; the new `worker-image` is imported onto the node; `deploy/worker.yaml` has its tag and `FACTORY8_REVIEW_MODEL`; it's applied with no run in flight. A run started with `temporal workflow execute` on a throwaway issue gets past the plan step with pod `factory8-<runId>-plan` deleted afterwards
- [ ] 5.5 First SDLC run (after 5.4). Done when:
  - An issue on factory8/factory8 goes through `f8 run` to a PR that has `.factory8/runs/<runId>/plan.md`, the code, and at least one review comment with ranked findings; the PR is ready for review and unmerged.
  - `f8 run` printed the final review's summary.
  - The share has one directory per step, and the review step's directory holds only its own session, on the reviewer model.
  - The user merges or closes the PR.
  - GitHub's answer to a self-approval is recorded in the design's Context.

## Workflow follow-up

- Archive M1 (`m1-issue-to-draft-pr`) before this change: M5's deltas modify `run-workflow`, `sandbox`, `project-detection` and `f8-cli`, which M1 adds.
- When 5.5 holds and M1 is archived, archive this change (`/openspec-archive-change`).
