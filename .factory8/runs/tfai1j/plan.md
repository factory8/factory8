# deploy/worker.yaml: its header still says the sandbox tag is updated there (#18)

Since #16 the shared worker serves no repo: `FACTORY8_IMAGES` is `{}` (`deploy/worker.yaml:62-63`), it runs 0 replicas, and the only image tag in the file is its own (`deploy/worker.yaml:53`). factory8/factory8's worker — its image *and* its sandbox tag — lives in `deploy/projects/factory8.yaml`. The header's second line still reads "Both image tags are Nix hashes: after `nix build .#worker-image` or `.#sandbox-image`, import the image and update its tag here." (`deploy/worker.yaml:2`): "both" is one too many, and a sandbox tag is never updated there now. The issue asks that the comment say each repo's sandbox tag goes in the Deployment that serves the repo — and that the wording be the owner's, not the run's.

## Files that change

**`deploy/worker.yaml`** — line 2 only, a comment; no manifest changes. The line must stop claiming a `.#sandbox-image` tag is updated "here" and say where it goes: the Deployment that serves the repo. That phrasing (the issue's own) stays true in both cases the design allows (M7 D7): a repo with its own worker — this repo, whose tag is `deploy/projects/factory8.yaml`'s `FACTORY8_IMAGES` — and a repo later added to the shared worker, whose tag would then be `deploy/worker.yaml`'s own `FACTORY8_IMAGES`.

**The wording is not this plan's to pick.** The owner was asked on the issue (2026-11-21, still unanswered): option A (two lines) or B (one line), or their own text. Whichever reply stands on #18 when the build starts is the wording used, verbatim; if none does, the build runs `f8-ask` and stops rather than choosing.

**`AGENTS.md`** — the last sentence of line 19, "After importing either image, put its new tag in `deploy/worker.yaml`.", stale the same way since #16 (this repo's sandbox tag goes in `deploy/projects/factory8.yaml`, as line 20 already says for the project worker's image). Also the owner's call, in the same pending reply; rewritten only on "yes", reusing the owner's chosen phrasing. One file on disk changes: `CLAUDE.md` is a symlink to it.

Out of scope unless the owner folds it in: `README.md:9` ("the worker's `FACTORY8_IMAGES` in `deploy/worker.yaml` maps the repo's URL to it") is stale the same way, but neither the issue nor the pending ask names it. No spec, site or code change: a comment is not specified behavior, and `docs/site/` summarizes the PRD.

## Order of work

1. Re-read issue #18 for the owner's reply: A, B or their own text, and yes/no on the `AGENTS.md` rider. No reply: `f8-ask` and stop.
2. Capture the baseline: `kubectl kustomize deploy/ > /tmp/render-before.yaml` in the dev shell.
3. Replace `deploy/worker.yaml:2` with the owner's wording, verbatim; if the rider is approved, rewrite that last sentence of `AGENTS.md:19` to match, touching nothing else in either file.
4. Read both files end to end and check every claim against `deploy/worker.yaml` (one image tag, empty `FACTORY8_IMAGES`, 0 replicas), `deploy/projects/factory8.yaml`, and PR #16.
5. `kubectl kustomize deploy/ > /tmp/render-after.yaml` and diff: identical, because comments don't render. Then `npm test` and `npm run typecheck` in the dev shell.

## Risks

- **Wording chosen by the run.** The issue forbids it. The plan pins no text: the build takes the owner's reply verbatim, and asks — and stops — without one.
- **A fix too specific to last.** "each repo's tag goes in `deploy/projects/factory8.yaml`" would be wrong the day a repo joins the shared worker; "the Deployment that serves the repo" holds for both. Both offered options keep it.
- **Scope creep.** Three lines are stale since #16: one is the issue's, one is the owner's pending rider, one (`README.md:9`) is flagged here for the owner's call and otherwise stays put. Nothing else moves.
- **A comment edit that breaks the file.** A lost `#` or a broken line would corrupt the manifest; a render that differs from the baseline cannot hide it.

## Proof

- `git diff master...factory8/tfai1j` shows `deploy/worker.yaml` and this plan — and `AGENTS.md` only if the rider was approved.
- The new comment matches the owner's reply on #18 word for word, quoted in the PR.
- `kubectl kustomize deploy/` renders identical before and after: nothing but comments moved.
- `npm test` and `npm run typecheck` pass in the dev shell, untouched by a comments-only diff.
- `deploy/worker.yaml` read end to end: no other line says a sandbox tag is updated there (the replicas comment, lines 43-44, already points at `deploy/projects/factory8.yaml`).

Run: tfai1j
Fixes #18
