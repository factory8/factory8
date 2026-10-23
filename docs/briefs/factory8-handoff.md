# Factory8: session handoff (2026-10-23, third session)

Read this first, then `docs/PRD.md`. These are the author's notes for Factory8, a self-hosted AI-native software factory. The author is building it for themselves first and plans to offer it to clients later as a single-tenant install.

## Where we are

- **Repo:** `github.com/factory8/factory8`.
  - Private; the default branch is `master`, the user's preference. Never use `main`.
  - The local clone is `~/code/softwory`; the directory hasn't been renamed.
  - Pushing uses HTTPS with a repo-local credential helper, `!gh auth git-credential`, under a gh account that has access to the org. The user's SSH keys have no access to the org.
- **What's in the repo:**
  - `AGENTS.md`, with `CLAUDE.md` as a symlink to it.
  - `flake.nix`: a dev shell with Node 24, the temporal CLI, kubectl, d2 and python3.
  - `adapter/`: the only code so far (see "Done" below).
- **`docs/PRD.md` is DRAFT v0.6.** §0 logs every change with requirement IDs. IDs are stable; ART-5 is the only retired one.
- **OpenSpec tracks our specs and tasks (since 2026-10-23).** It's our tooling, not part of the product. `openspec list` shows progress, and the `/openspec-*` skills drive the work.
  - `openspec/specs/agent-adapter`: the adapter as built (the old contracts §1).
  - `openspec/changes/m1-issue-to-draft-pr`: proposal; delta specs `project-detection` (old §2), `sandbox` (with the POC credentials, old §5), `run-workflow` and `f8-cli`; `design.md` with D1–D8, still proposals only, which agreeing is the next task; and `tasks.md`.
  - `m2-progress-and-logs`, `m3-questions-suspend-resume`, `m4-recovery`: a proposal and tasks each. Their specs and design are written when each milestone starts.
  - The old §3 (run branch layout, front-matter, trailer) and §4 (`IntentEnvelope`) aren't written yet.
- **`docs/plans/poc.md`:** the POC exit criterion, the milestone order, and "Not in the POC".
- **`docs/site/`:** `prd.html` and `architecture.html` summarize the PRD; the D2 diagrams `arch.d2` (ELK layout), `run.d2` and `phases.d2` illustrate it.
  - `PRD.md` in that directory is a symlink.
  - Re-render a diagram with `d2 x.d2 x.svg`. For PNG previews, run `nix run nixpkgs#librsvg -- -w 1400 x.svg -o x.png`.
  - `index.html` and `loop`/`governance`/`maintain.d2` are the playbook digest, not the PRD.
- **Third-party originals stay local only.** `AI_Native_SDLC_Playbook_designv2.md/.pdf` (by Anthropic) are gitignored.
- **Beads was removed on 2026-10-23.** Its plan content now lives in OpenSpec. Factory8 itself doesn't use beads either; it was dropped from the product in PRD v0.3. Don't bring it back.

## Decisions so far (PRD v0.6)

- **Dogfooding (G11, OQ-3 resolved):** Factory8 is developed with Factory8. Phase 0 lands as usable increments:
  - M1: `f8 run <issue>` → sandbox built from the repo's Nix shell → Claude Code → draft PR.
  - M2: heartbeats and progress, session logs, `f8 runs`.
  - M3: `needs_input` → suspend/resume, `/answer`, `f8 answer`.
  - M4: retry after a stall or sandbox death.
  - The pilot `librepod/marketplace` runs alongside.
- **Nix first (PRJ-8):** the first environment provider reads a `flake.nix` dev shell or a `shell.nix`. Dev Containers move to Phase 4.
- **`project.yaml` postponed** until a feature needs it (Phase 1). Phase 0 auto-detects the environment, `AGENTS.md` and CLI-native skills/MCP, and uses installation defaults.
- **Adapter (AGT-1, SBX-3):** a daemon inside the sandbox. A worker activity starts the step and long-polls its events, which become the heartbeats.
- **Questions (SBX-11, A15):** the agent runs `f8-ask "<question>"`, the same for every CLI. The user had preferred Claude Code's native tool plus a hook, but headless Claude Code doesn't offer `AskUserQuestion` (tested).
- **Prompt split:** the start-step activity renders the vendor-neutral task prompt; the adapter adds the protocol preamble.
- **Keep Phase 0 minimal:** trust the agent's `done`; `failed` carries plain reason text; the agent commits and pushes its own work.
- **Session logs (AGT-11):** the vendor `*.jsonl` files and the adapter's event log stay on the run's PVC, which outlives the sandbox. Nothing is uploaded (changed 2026-10-23; Claude Code resumes from the file alone).
- **LLM gateway = LiteLLM:** a LibrePod marketplace app the user installs on the pilot cluster from its UI (task 1.2). Temporal gets its own Postgres.
- **Sandboxes are plain Kata pods (2026-10-23):** agent-sandbox is dropped. The worker creates a PVC and a pod per run, both named `f8-<runId>`. Suspend deletes the pod and keeps the PVC (M1 design D2; PRD SBX-1).
- **POC first:**
  - No git gateway. A GitHub token (`GH_TOKEN`) and one static LiteLLM key reach the sandbox from a Kubernetes Secret, and the agent pushes directly (`sandbox` spec in the M1 change).
  - This is tracked as [#1](https://github.com/factory8/factory8/issues/1) (label `hardening`).
  - **Don't ask hardening questions.** Add the gap to "Not in the POC" in `docs/plans/poc.md`.

## Done

`adapter/` contains `f8-adapter serve` and `f8-ask`.
- **Tests:** `npm test` runs them against a fake `claude` and a local bare repo. `npm run typecheck` runs `tsc` with no emit.
- **Real runs:** on the host against Claude Code 2.1.289, it pushed to the run branch with the `Factory8-Run` trailer, and completed f8-ask → `needs_input` → answer → resume in the same session.

Task 1.3 (2026-10-24): `nix build .#sandbox-image` builds the project image from the dev shell (`lib.sandboxImage` in `flake.nix`), and a real step ran inside it under docker. See D3 in M1's `design.md`.

## Next step: the M1 build tasks

Task 1.D is done (2026-10-23): D1–D8 in M1's `design.md` are all decided with the user, and the specs and tasks match them. In short:
- D1: a dumb worker (sandbox lifecycle and adapter calls only); session logs stay on the PVC; the run ID is 6 random characters, not tied to the issue.
- D2: a plain Kata pod and PVC per run, reached at the pod IP.
- D3: the project image from the dev shell (`streamLayeredImage`), tagged with its Nix hash, imported onto the node.
- D4: everything in `deploy/`; vendor charts; Postgres as a plain Deployment; Temporal; Kata through the kata-deploy 4.3.1 chart (an earlier NixOS spike's workarounds as the fallback); a Nix-built worker image.
- D5: `f8 run <issue>` builds the repo URL from `origin`; Ctrl-C only detaches.
- D6: the agent opens the draft PR.
- D7: workspaces `adapter/`, `worker/` and `cli/`; workflow tests in Temporal's local mode.
- D8: the worker's settings are `TEMPORAL_ADDRESS`, `F8_MODEL` and `F8_IMAGES`; the default profile is filled in by `startStep`.

**Start with** the tasks that need nothing else (see M1's `tasks.md`):
- 1.1 cluster setup (*user* + me) and 1.2 LiteLLM check (*user*), which need the user at the cluster;
- 1.10 the adapter's process-group cancel, which needs no cluster (1.3 is done).

**Read first, in order:**
1. `AGENTS.md`.
2. This handoff.
3. `docs/plans/poc.md`.
4. The M1 change, `openspec/changes/m1-issue-to-draft-pr/`: its proposal, `design.md`, its specs and `tasks.md`.
5. `openspec/specs/agent-adapter/spec.md`.
6. PRD §7 and the Phase 0 row of §8.
7. `adapter/src/main.ts`.

**How to work:** one task per session, with the user's review in between; tick it in `tasks.md` when its "done when" holds. Commit and push only when the user asks.

## Facts and gotchas

- **The pilot cluster:** in repo docs, call it "the pilot cluster", never by its real name.
  - Single-node k3s on NixOS. The user proved the Kata RuntimeClass in an earlier POC.
  - An NFS provisioner provides PVCs.
  - Its only StorageClass, `nfs-client`, isn't the default, so PVCs must name it. It keeps a deleted PVC's files at `<namespace>/<pvc name>` on the share.
  - Port-forwarding to Kata pods doesn't work, so the worker must run in the cluster to reach the adapter.
- **Toolchain:** Node runs the `.ts` files directly (type stripping), so only erasable syntax is allowed. The adapter has no runtime dependencies. TypeScript 7 is used for type checking only.
- **Claude Code, verified:** a failed `--resume` exits with code 1 and emits no `init` event. The adapter treats that as the signal to fall back to a fresh session plus the handoff note.
- **`pkill -f "<pattern>"`** also kills the shell that runs it. Use `pkill -f "[a]dapter/src/main.ts"`.
- **`nix develop`** prints a "Git tree is dirty" warning; it's harmless.
- **Testing the adapter on a host:** it sets `HOME=$F8_ROOT/home`, so the CLI has no login there. Symlink `~/.claude/.credentials.json` into that home for the local test only, then delete it.

## Still open

- **The spec:** §3 and §4.
- **The PRD (§14):** OQ-2, 6, 8–13 and 15.
- **Verify in Phase 0:**
  - A8: Kata suspend on NFS.
  - A9: resume after the pod is replaced.
  - A13: Claude Code through LiteLLM.
  - A14: a Nix image under Kata.
  - `--dangerously-skip-permissions` as root with `IS_SANDBOX=1` (always on, decided 2026-10-23).
- **The `factory8` org is on GitHub's free plan.** Branch protection isn't available on private repos there, so nothing stops an agent's token from pushing to `master` (#1), and code-owner approval (DEP-2) can't be enforced.

## Not yet thought through (raise when relevant)

- The workspace layout on NFS (`node_modules`, Go modules): what is baked into the image and what lives on the PVC.
- Exposure of the `f8` CLI/API while there is no auth.
- Poll cadence versus GitHub API rate limits.
- **The pilot repo's needs:** Docker in the VM for k3d, and Node, which its `shell.nix` lacks. It also uses beads for its own tasks, which would need a path to its Dolt server or none at all.
- The client pitch versus SuperPlane and hosted agents.

## How to work with the user

- **Grill style:** ask one question at a time, with a guess attached, and push back when warranted. Keep proposals minimal; the user dislikes over-engineering.
- **POC first.** Prefer extending existing tools over writing new services. Skip security and hardening questions.
- **Plan before building.** Agree the plan before writing code, then do one task per session, with the user's review in between.
- **Tooling isn't product.** A request about how *we* work (trackers, scripts) never changes the PRD without asking first.
- **After any PRD change:**
  1. Add a §0 row.
  2. Update `prd.html` and `architecture.html`.
  3. Re-render any diagram that changed.
  4. Update the memory file `software-factory-architecture-decisions.md`.
