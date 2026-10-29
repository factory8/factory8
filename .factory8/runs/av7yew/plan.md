# Plan: throwaway M5 deploy verification run

Issue #6 exists to verify the M5 worker deploy (task 5.4 in `openspec/changes/m5-sdlc-workflow/tasks.md`): a run started manually with `temporal workflow execute` on a throwaway issue must get past the plan step, with that step's pod deleted afterwards. So this run's deliverable is the run itself, not a change: it writes this plan, opens the PR, and lets the deployed worker's behaviour be the evidence. The issue is closed by the human when the verification holds; no agent merges (G4).

## Files that change

- `.factory8/runs/av7yew/plan.md` (new): this file. Nothing else — the run has no code to change.

## Order of work

1. **Plan (this step):** read issue #6, write this file, push `f8/av7yew`, and open the draft PR with the issue's title and a body ending in `Run: av7yew` and `Fixes #6`.
2. **Build:** the plan lists no code, so there is nothing to implement. Run the repo's checks (`npm test`, `npm run typecheck` in `nix develop`) to confirm the branch is green with the plan added, and push only a fix if something failed (nothing should).
3. **Review:** review this PR — a plan.md-only diff — against issue #6 and this plan, post ranked findings, end with a verdict. On `ready`, mark the PR ready; on `changes`, at most two fix rounds, then the run fails `changes_requested` and the PR stays a draft for the human.
4. **The verification itself, outside the run (user):** after each step ends its pod is gone (`kubectl -n factory8 get pod f8-av7yew-<stage>`, starting with `f8-av7yew-plan`) while its PVC stays, and the Temporal UI shows the steps `<runId>.<stage>.1` in order. That is 5.4's last "done when"; the user then closes the issue by merging or by hand.

## Risks

- The deployed worker runs the M5 workflow, but master (this branch's base) doesn't carry that code yet, so this run cannot fix the worker if the verification fails. A failure is the finding this run exists to surface; 5.4 stays open and the failure reason lands on the issue or the PR.
- `npm test` starts the worker's own `temporal` inside the sandbox; if the dev shell or CLI misbehaves there, the build step reports it — a deploy finding too, not something this plan changes.
- A no-op change still pays for the full loop: build and review pods and models, and up to 7 PVC directories on the share. Accepted; the loop is what's being verified.
- "Close when done" is the human's act. If the review never reaches `ready`, the run ends `changes_requested` with the PR left a draft, and the user closes both.

## Proof

- `git diff master...f8/av7yew` is exactly one new file, `.factory8/runs/av7yew/plan.md`, in a commit carrying the `Factory8-Run: av7yew` trailer.
- A draft PR titled "Throwaway: M5 deploy verification run" exists from `f8/av7yew`, its body carrying this summary, `Run: av7yew` and `Fixes #6`.
- The run got past the plan step: this file and that PR are its output, and the plan step's pod `f8-av7yew-plan` was deleted when the step ended — observed by the user with kubectl, since the agent cannot see its own pod go away. Later steps repeat the pattern in their own sandboxes (`f8-av7yew-build`, `f8-av7yew-review-1`).
- The share keeps one directory per step (`f8-sandboxes/f8-av7yew-<stage>`), the plan step's holding this session's logs, which is what makes the cleanup checkable after the fact.
