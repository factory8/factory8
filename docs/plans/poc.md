# POC plan (Phase 0, M1–M6)

**Status:** agreed 2026-10-22 · from PRD v0.6 §8 · tasks tracked in OpenSpec since 2026-10-23

**The POC is done when** Phase 0's exit criterion holds, minus the deferred hardening:
- On factory8/factory8 and `librepod/marketplace`, an issue becomes a sandboxed Claude Code run through LiteLLM, which produces a PR, reviewed in a separate sandbox and ready for a human.
- The run shows live progress and keeps its session logs.
- A mid-step question suspends the sandbox and resumes it after the answer.
- The run survives a stall and a sandbox death.
- Factory8's own changes are made through Factory8 runs.

## How the work is done

- **Tracking:** each milestone is an OpenSpec change in `openspec/changes/`. Its `tasks.md` is the tracker: tick a task (`- [x]`) when its "done when" holds; "after" names the tasks it waits on. `openspec list` shows progress.
- **Specs and design** for a milestone are written when it starts; until then a change holds only its proposal and tasks. When a milestone is done, archive its change (`/openspec-archive-change`): its delta specs merge into `openspec/specs/`, which describes what's built.
- **Until M1 works,** Factory8 can't build itself, so we build by hand: one task per working session, reviewed before the next one starts. Each session ends with a commit and a handoff update.
- **Watch upstream:** when a milestone's design starts, skim the sources of [google/ax](https://github.com/google/ax) and [Agent Substrate](https://github.com/agent-substrate/substrate) for how they solve the problems that milestone faces. Examples: credentials injected at an egress proxy (#1), memory and workspace snapshots for suspend (SBX-11–13, SBX-18), the in-sandbox runner contract (`ax-task-runner` vs `f8-adapter`), forking a task, debug shells, and images pinned by digest. We reviewed them on 2026-10-23 (AX v0.3.1) and didn't adopt them: Substrate needs Kubernetes 1.36+, AX has no durable workflows or human waits, and its models are Google-only. Reconsider when Substrate reaches 1.0. Likewise [kagent](https://github.com/kagent-dev/kagent), reviewed the same day (v1.0.0-alpha17, stable v0.10.4) and not adopted: its Claude Code harness exists only in the v1 alpha, which runs on a fork of Substrate (Kubernetes 1.36+), and it has no workflows, retries or forge intake. Its Claude harness is the part to read: answering `AskUserQuestion` through a deferring PreToolUse hook and `--resume` (M3), token totals after a resume (NFR-7), marking a failed resume abandoned, and an idle TTL for unanswered waits. Reconsider at kagent v1 GA on a 1.36+ cluster.
- **From M1 on (dogfooding, G11):** each task gets a GitHub issue and runs through `f8 run <issue>`. The user reviews its draft PR. We work interactively only on cluster tasks (marked *user*) and on runs that fail.

## Milestones

| Milestone | Change | After |
|---|---|---|
| M1: issue → sandboxed agent → draft PR (by hand) | `m1-issue-to-draft-pr` | |
| M5: the SDLC run (plan, build, review/fix, ready PR) | `m5-sdlc-workflow` | 1.8 |
| M6: the ship run (design, tests first, graded reviews, ladder, human waits) | `m6-ship-workflow` | M5 |
| M2: live progress and session logs | `m2-progress-and-logs` | M6 |
| M3: questions with suspend/resume | `m3-questions-suspend-resume` | M6; its spike 3.1 only needs 1.4, so run it early |
| M4: recovery | `m4-recovery` | M6, 2.2; its cleanup task 4.4 also needs 3.2 |

## Not in the POC

**Hardening (POC first):**
- [#1](https://github.com/factory8/factory8/issues/1): remove credentials from agent sandboxes (ART-4, SBX-5, AGT-6). One way: an egress proxy that adds the tokens on the way out, as Agent Substrate does; kagent's egress gateway swaps a placeholder `Authorization` header for the Secret's value.
- Gateway enforcement of TST-3: the ship run's code reviewer checks that the acceptance tests are unchanged, so only a prompt stops an implementer editing them. Fix: the git gateway rejects pushes that touch the tests (with #1).
- Default-deny NetworkPolicy for sandboxes (SBX-3). The pilot cluster's one node also runs the user's other production services, and until this lands a sandbox can reach every in-cluster Service.
- Egress proxy with allowlist (SBX-4).
- Backups for Temporal's Postgres and object storage (PLT-2).
- Scan project images (SBX-9).
- Resource limits per step (SBX-7).
- [#5](https://github.com/factory8/factory8/issues/5): authorization in Temporal. The web UI at `temporal.libre.pod` logs in through Casdoor (`deploy/web.yaml`), but the server has no `Authorizer`, so everyone who can log in can do anything, and the frontend's gRPC port, which `f8` reaches through a port-forward or the tailnet, takes no credentials. Fix: the server's JWT `ClaimMapper` and `Authorizer` with Casdoor's keys, and tokens for the worker and `f8`.

**Later:**
- The project image build workflow (SBX-17, Phase 1). Until then, `nix build` runs by hand.
- Packaging: wrap `deploy/` into a Helm chart or something similar (packaged install, Phase 4). Until then, `kubectl apply -k deploy/` runs by hand.
- Contracts not written yet (OQ-16): the run branch layout, front-matter and commit trailer; `IntentEnvelope` (fields only; INT is Phase 1). Each becomes a spec when a change first needs it.
- Adapter: Codex and pi adapters (Phase 1 and 2); failure classes, result verification, and a resume-vs-handoff cost policy (NFR-7), which waits for real numbers.
- Retention for run PVCs (ART-10, Phase 2). Until then, finished runs' PVCs and their files on the share are deleted by hand.
- Docker inside the sandbox (for `docker compose`): an earlier Kata spike needed `privileged: true` (safe inside the microVM) and `/var/lib/docker` on an `emptyDir` with `medium: Memory`, because overlay2 can't stack on virtio-fs and dockerd falls back to `vfs`.
- If agents skip the handoff note in practice, add a Claude Code `Stop` hook that blocks until `handoff.md` exists.
