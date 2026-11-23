# deploy/worker.yaml: its header still says the sandbox tag is updated there (#18)

Since #16 the shared worker serves no repo (`FACTORY8_IMAGES` is `{}`, 0 replicas) and each repo's sandbox tag lives in the project-worker Deployment that serves it — this repo's in `deploy/projects/factory8.yaml`. `deploy/worker.yaml:2` still says "Both image tags … update its tag here", so anyone rebuilding `.#sandbox-image` lands its tag in the wrong file. The fix is that one comment line, rewritten to keep the true half (the `.#worker-image` tag is a Nix hash, updated here after an import) and to say each repo's sandbox tag goes in the Deployment that serves the repo. **The wording is the owner's call** (the issue says so): it is already asked on the issue — the pending comment offers option A, option B, or the owner's own text — and this plan does not choose.

## Files that change

**`deploy/worker.yaml`** — line 2 only:

```
# Both image tags are Nix hashes: after `nix build .#worker-image` or `.#sandbox-image`, import the image and update its tag here.
```

replaced verbatim by the owner's chosen text. Header lines 1 and 3, and every manifest below, are untouched.

**`AGENTS.md`** — line 19's last sentence, "After importing either image, put its new tag in `deploy/worker.yaml`.", only if the owner's answer also takes the rider offered in that issue comment. It then stops pointing `.#sandbox-image` (line 18) at `deploy/worker.yaml` and sends this repo's sandbox tag to `deploy/projects/factory8.yaml`, agreeing with line 20's rule for `.#project-worker-image`. `CLAUDE.md` is a symlink to `AGENTS.md`, so no second edit follows. If the owner keeps the change to `deploy/worker.yaml`, this file is untouched.

No other file: `deploy/projects/factory8.yaml`'s header already says where its two tags go, and the echoes in `docs/briefs/` and `openspec/changes/archive/` are history, not instruction.

## Order of work

1. Read the owner's answers on issue #18: the wording (A, B, or their own text) and the rider. Wording chosen and rider taken: build both files above. Rider declined: drop step 3. Either unanswered when the build starts: ask again with `f8-ask` and stop — never pick a wording.
2. Replace `deploy/worker.yaml:2` with the chosen text, verbatim.
3. If the rider is taken, rewrite `AGENTS.md:19`'s last sentence; then check the two files agree on where each of the three image tags lives (`.#worker-image` → `deploy/worker.yaml`; `.#project-worker-image` and `.#sandbox-image` → `deploy/projects/factory8.yaml`).
4. Grep the repo, excluding `docs/briefs/` and `openspec/changes/archive/`: nothing still tells anyone to put a sandbox tag in `deploy/worker.yaml`.
5. In the dev shell, `npm test` and `npm run typecheck` — the checks `AGENTS.md` names, which a comment-only diff must pass unchanged — and `kubectl kustomize deploy/` to prove the manifests still render.

## Risks

- **Choosing the wording** — the one risk the issue calls out. The build takes the text verbatim from the owner's answer; this plan states no preference between A and B, and step 1 refuses to proceed without an answer.
- **The two files disagree** — if the rider is taken, `AGENTS.md` must not contradict the new header; step 3's three-tag check catches it.
- **Scope creep** — the old rule also echoes in `docs/briefs/factory8-handoff.md` and the openspec archives; they record what was true when written and stay untouched, like the issue's single-file scope.
- **The answer and the go-ahead arrive apart** — the wording lands on the issue, the run's `go` on the run; if `go` arrives with no wording chosen, step 1 asks rather than guesses.

## Proof

- `git diff master...factory8/6swt5e --stat`: `deploy/worker.yaml` and this run's `plan.md`, plus `AGENTS.md` only if the rider was taken.
- The new `deploy/worker.yaml:2` matches the owner's answer on the issue verbatim, quoted in the build's summary.
- Step 4's grep comes back empty outside the history files.
- `npm test`, `npm run typecheck` and `kubectl kustomize deploy/` pass in the dev shell.

Run: 6swt5e
Fixes #18
