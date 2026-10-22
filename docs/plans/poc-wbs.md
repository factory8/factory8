# POC work breakdown (Phase 0, M1–M4)

**Status:** agreed 2026-10-22 · from PRD v0.6 §8 and `specs/phase0-contracts.md`

**Tasks live in beads.** Their order, acceptance criteria and status are tracked there, not here:
- `bd ready`: the unblocked tasks.
- `bd show <id>`: one task.
- `bd dep tree <id>`: what a task waits on.

**The POC is done when** Phase 0's exit criterion holds, minus the deferred hardening:
- On factory8/factory8 and `librepod/marketplace`, a bead becomes a sandboxed Claude Code run through LiteLLM, which produces a draft PR.
- The run shows live progress and keeps its session logs.
- A mid-step question suspends the sandbox, and `f8 answer` resumes it.
- The run survives a stall and a sandbox death.
- Factory8's own changes are made through Factory8 runs.

## How the work is done

- **Until M1 works,** Factory8 can't build itself, so we build by hand: one task per working session, reviewed before the next one starts. Each session ends with a commit and a handoff update.
- **From M1 on (dogfooding, G11):** each task runs through `f8 run <bead>`, and the user reviews its draft PR. We work interactively only on cluster tasks and on runs that fail.

## Milestones

| Epic | Milestone | Shape |
|---|---|---|
| `factory8-4cd` | **M1** bead → sandboxed agent → draft PR | Built by hand. Three tasks start in parallel: the cluster check, the LiteLLM check (A13) and the Nix project image (A14). They lead to the sandbox on the cluster, then Temporal, the worker and the workflow, then `f8 run`, the first dogfooded run, and the pilot run |
| `factory8-2kk` | **M2** live progress and session logs | Session logs in object storage, heartbeats with progress, `f8 runs` / `f8 watch`, a progress comment on the PR |
| `factory8-q60` | **M3** questions with suspend/resume | A spike first: Kata suspend on NFS (A8). It needs only the sandbox on the cluster, so it can run early. Then the workflow waits on `needs_input`, and `f8 answer` replies. `/answer` on a GitHub issue comes with Phase 1 intake |
| `factory8-94t` | **M4** recovery | Retry after a stall, then escalate; retry after a sandbox death; a fault-injection test; cleanup at run end |

## Not in the POC

- **Hardening:** `bd list -l hardening`. The first item is #1 on GitHub (credentials in the sandbox); the rest are the network policy, the egress proxy, backups, image scanning and resource limits.
- **Later:** the project image build workflow (SBX-17, Phase 1); until then, `nix build` runs by hand. Spec §3 and §4 get written when a task first needs them.
