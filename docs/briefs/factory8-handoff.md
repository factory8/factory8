# Factory8: session handoff (2026-10-22, second session)

Read this first, then `docs/PRD.md`. These are the author's notes for Factory8, a self-hosted AI-native software factory. The author is building it for themselves first and plans to offer it to clients later as a single-tenant install.

## Where we are

- **Repo:** `github.com/factory8/factory8` (private, default branch `master`, which is the user's preference; never `main`). The local clone is still in `~/code/softwory`; the directory hasn't been renamed. Code doesn't exist yet. `AGENTS.md` (with `CLAUDE.md` as a symlink to it) and a `flake.nix` dev shell (Node 24, Temporal CLI, kubectl, d2, python3) are in place.
- **`docs/PRD.md` is DRAFT v0.6.** §0 logs every change with requirement IDs. IDs are stable, and ART-5 is the only retired one.
- **`docs/specs/phase0-contracts.md`:**
  - §1 (agent adapter) and §2 (project detection) are drafted.
  - §3 (run branch layout, front-matter, trailer) and §4 (`IntentEnvelope`, fields only) are still todo.
- **`docs/site/`:** `prd.html` and `architecture.html` summarize the PRD, and the D2 diagrams `arch.d2` (ELK), `run.d2` and `phases.d2` illustrate it.
  - `PRD.md` in that directory is now a symlink, so there's nothing to copy.
  - Re-render a diagram with `d2 x.d2 x.svg`.
  - For PNG previews, use `nix run nixpkgs#librsvg -- -w 1400 x.svg -o x.png`.
  - `index.html` and `loop`/`governance`/`maintain.d2` are the playbook digest, not the PRD.
- **Third-party originals stay local only.** `AI_Native_SDLC_Playbook_designv2.md/.pdf` (by Anthropic) are gitignored.

## Decisions this session (PRD v0.6)

- **Dogfooding (G11, OQ-3 resolved):** Factory8 is developed with Factory8. Phase 0 lands as usable increments:
  - M1: `f8 run <bead>` → sandbox built from the repo's Nix shell → Claude Code → draft PR.
  - M2: heartbeats and progress, session logs, `f8 runs`.
  - M3: `needs_input` → suspend/resume, `f8 answer`.
  - M4: retry after a stall or sandbox death.
  - The pilot `librepod/marketplace` runs alongside.
- **Nix first (PRJ-8):** the first environment provider reads a `flake.nix` dev shell or `shell.nix`. Dev Containers move to Phase 4. A14 is now the Nix image spike.
- **`project.yaml` postponed** until a feature needs it (Phase 1). Phase 0 auto-detects the environment, `AGENTS.md` and CLI-native skills/MCP, and uses installation defaults.
- **Adapter (AGT-1, SBX-3):**
  - The adapter is a daemon inside the sandbox. A worker activity starts the step and long-polls its events, which become the heartbeats.
  - Tokens arrive only in the request.
  - Hooks run only inside the adapter, never as a channel to Temporal.
- **Questions (SBX-11, A15):** the agent runs `f8-ask "<question>"`, which works the same for every CLI. The user had preferred the native tool plus a hook, but headless Claude Code doesn't offer `AskUserQuestion` (tested).
- **Prompt split:** the start-step activity renders the vendor-neutral task prompt from refs, and the adapter adds the protocol preamble.
- **Keep Phase 0 minimal** (the user pushed back on over-engineering): trust the agent's `done`. `failed` carries plain reason text. The agent commits and pushes its own work.
- **Session logs (AGT-11, new):** vendor `*.jsonl` files plus the adapter's event log go to object storage at every exit, so a session can be restored and analysed.
- **LLM gateway = LiteLLM**, the user's existing instance on the pilot cluster. Temporal gets its own Postgres. LiteLLM can't proxy git: its pass-through re-encodes request bodies as JSON.
- **POC first:**
  - No git gateway. A GitHub token (`GH_TOKEN`) and one static LiteLLM key reach the sandbox from a Kubernetes Secret, and the agent pushes directly (spec §5).
  - This is tracked as [#1](https://github.com/factory8/factory8/issues/1) (label `hardening`).
  - **Don't ask hardening questions.** File them as beads labelled `hardening` instead.

## Next step: the plan is in beads

The plan is `docs/plans/poc-wbs.md`. Its tasks are beads under the epics M1 (`factory8-4cd`) to M4. Run `bd ready` to list the unblocked tasks, and ask the user which one to take.

- **Done:** `adapter/` (`f8-adapter serve`, `f8-ask`) with tests (`npm test`, fake `claude`), and runs on the host against real Claude Code 2.1.289 covering push + trailer and ask → answer → resume.
- **A15 was false:** headless mode has no `AskUserQuestion`, so `f8-ask` is the question mechanism, and Phase 0 uses no vendor hooks.
- **Ready now, can run in parallel:**
  - the cluster check;
  - the LiteLLM check (A13), which needs LiteLLM's URL and a key from the user;
  - the project image from the Nix dev shell (A14).

## Still open

- **The spec:** §3 and §4.
- **The PRD (§14):** OQ-2, 6, 8–13 and 15.
- **Verify in Phase 0:**
  - A8: Kata suspend on NFS.
  - A9: headless resume.
  - A13: each CLI accepts a custom endpoint.
  - A14: Nix dev shell → OCI image under Kata.
  - A15: `AskUserQuestion` in `-p` mode.
  - The other items in spec §1.8.
- **The `factory8` org is on GitHub's free plan.** Branch protection isn't available on private repos there, so nothing stops an agent's token from pushing to `master` (#1), and code-owner approval (DEP-2) can't be enforced.

## Not yet thought through (raise when relevant)

- The workspace layout on NFS (`node_modules`, Go modules): what is baked into the image and what lives on the PVC. M1 will produce real numbers.
- Exposure of the `f8` CLI/API while there is no auth.
- Poll cadence versus GitHub API rate limits.
- The pilot needs Docker in the VM for k3d, and Node, which its `shell.nix` lacks. It also uses beads (`bd`), whose Dolt sync would need a path through the gateway or none at all.
- The client pitch versus SuperPlane and hosted agents.

## How to work with the user

- **Grill style:** ask one question at a time, with a guess attached, and push back when warranted. Keep proposals minimal; the user dislikes over-engineering.
- **POC first.** Prefer extending existing tools over writing new services. Skip security and hardening questions: take the direct path and file a `hardening` bead.
- **Plan before building.** Agree the plan before writing code, then do one task per session with the user's review in between. Don't build a whole milestone in one go.
- **After any PRD change:**
  1. Add a §0 row.
  2. Update `prd.html` and `architecture.html`.
  3. Re-render any diagram that changed.
  4. Update the memory file `software-factory-architecture-decisions.md`.
