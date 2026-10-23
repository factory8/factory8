# POC work breakdown (Phase 0, M1–M4)

**Status:** agreed 2026-10-22 · from PRD v0.6 §8 and `specs/phase0-contracts.md` · this file is the task tracker until a tool is chosen

**The POC is done when** Phase 0's exit criterion holds, minus the deferred hardening:
- On factory8/factory8 and `librepod/marketplace`, an issue becomes a sandboxed Claude Code run through LiteLLM, which produces a draft PR.
- The run shows live progress and keeps its session logs.
- A mid-step question suspends the sandbox and resumes it after the answer.
- The run survives a stall and a sandbox death.
- Factory8's own changes are made through Factory8 runs.

## How the work is done

- **Until M1 works,** Factory8 can't build itself, so we build by hand: one task per working session, reviewed before the next one starts. Each session ends with a commit and a handoff update.
- **From M1 on (dogfooding, G11):** each task gets a GitHub issue and runs through `f8 run <issue>`. The user reviews its draft PR. We work interactively only on cluster tasks (marked *user*) and on runs that fail.
- **Tracking here:** mark a task ✅ when its "done when" holds. "After" lists the tasks it waits on.

## M1: issue → sandboxed agent → draft PR (by hand)

| # | Task | After | Done when |
|---|---|---|---|
| 1.0 ✅ | `f8-adapter` + `f8-ask` (spec §1) | | Tests pass; on the host, real Claude Code pushed with the trailer and completed ask → answer → resume |
| 1.1 | Cluster check: Kata, agent-sandbox, NFS (*user* + me) | | A Kata pod and an agent-sandbox `Sandbox` from a `SandboxTemplate` run on the pilot cluster with an NFS PVC mounted |
| 1.2 | LiteLLM check (A13). Needs LiteLLM's URL and a key | | One adapter step on the host runs through LiteLLM with a static key |
| 1.3 | Project image from the Nix dev shell (A14) | | `nix build` makes an OCI image: the factory8 dev shell + claude-code + git + gh + the adapter. A step runs inside it under docker |
| 1.D | M1 technical design (`docs/design/m1.md`, D1–D8) | | The user has agreed each decision. Facts are recorded. Tasks 1.4–1.9 link to their sections. No code is written |
| 1.4 | Sandbox on the cluster. The *user* creates the GitHub token and the Secret | 1.1, 1.2, 1.3, 1.D | Secret + `SandboxTemplate` (Kata, PVC at `/f8`, adapter as the main process). A step started with `curl` from an in-cluster pod pushes a branch. Root + `IS_SANDBOX` verified |
| 1.5 | Temporal + Postgres on the cluster (PLT-1) | 1.1, 1.D | Manifests in the repo and applied; the `temporal` CLI reaches it through a port-forward |
| 1.6 | Worker + one-step workflow (`worker/`) | 1.4, 1.5, 1.D | The workflow creates the Sandbox, starts the step, polls until it exits, opens a draft PR, then deletes the Sandbox. The worker runs in the cluster |
| 1.7 | `f8 run <issue>` (`cli/`) | 1.6, 1.D | Renders the prompt from the issue, starts the workflow and prints the draft PR URL |
| 1.8 | First dogfooded run | 1.7 | An issue on factory8/factory8 becomes a draft PR through `f8 run`, and we merge it |
| 1.9 | Pilot run on `librepod/marketplace` | 1.8 | The same on the pilot repo. Its `shell.nix` needs Node, and k3d needs Docker in the VM |

1.1, 1.2, 1.3 and 1.D can run in parallel; the facts from 1.1 and 1.2 feed 1.D.

## M2: live progress and session logs (dogfooded)

| # | Task | After | Done when |
|---|---|---|---|
| 2.1 | Session logs to object storage (AGT-11) | 1.8 | A MinIO bucket exists (already on the cluster, or deployed); the worker presigns a PUT per step; archives land under `<run>/<step>/` |
| 2.2 | Step heartbeats with progress (ORC-13) | 1.8 | The poll activity heartbeats the latest progress; the heartbeat timeout is `progressTimeout` |
| 2.3 | `f8 runs`, `f8 watch <run>` (PLT-5) | 2.2 | List runs with their stage and latest progress; follow a run live (workflow query); `--json` output |
| 2.4 | Progress comment on the PR (ORC-13) | 2.2 | One status comment on the PR, edited as the run progresses |

## M3: questions with suspend/resume (dogfooded, except the spike)

| # | Task | After | Done when |
|---|---|---|---|
| 3.1 | Spike: suspend/resume on Kata + NFS (A8, A9). By hand; run it early, because it decides the M3 design | 1.4 | A suspended Sandbox's pod is gone and its PVC kept; after resume, `claude --resume` continues the session |
| 3.2 | Workflow waits on `needs_input` (SBX-11–13, ORC-5) | 3.1, 1.8 | It posts the question on the issue, suspends the Sandbox and waits for a signal. When the signal arrives, it resumes the Sandbox, POSTs `/answer` and polls again |
| 3.3 | `/answer` on the issue | 3.2 | An owner-only comment poller sends the signal |
| 3.4 | `f8 answer <run> "<text>"` | 3.2 | Sends the same signal |

## M4: recovery (dogfooded)

| # | Task | After | Done when |
|---|---|---|---|
| 4.1 | Stall → retry, then escalate (ORC-4, ORC-13) | 2.2 | A step with no progress past its timeout is cancelled and retried on the same PVC, resuming the session with "continue". After the last attempt, the run escalates on the issue |
| 4.2 | Sandbox death → retry | 1.8 | Deleting the pod mid-step leads to a retry with a new pod on the same PVC |
| 4.3 | Fault-injection test | 4.1, 4.2 | A script forces a failure, a stall and a pod kill on a real run; the run still finishes |
| 4.4 | Cleanup at run end (SBX-15) | 2.1 | At run end or cancel, the logs get a last upload, then the Sandbox and PVC are deleted |

## Not in the POC

**Hardening (POC first):**
- [#1](https://github.com/factory8/factory8/issues/1): remove credentials from agent sandboxes (ART-4, SBX-5, AGT-6).
- Default-deny NetworkPolicy for sandboxes (SBX-3).
- Egress proxy with allowlist (SBX-4).
- Backups for Temporal's Postgres and object storage (PLT-2).
- Scan project images (SBX-9).
- Resource limits per step (SBX-7).

**Later:**
- The project image build workflow (SBX-17, Phase 1). Until then, `nix build` runs by hand.
- Spec §3 and §4, when a task first needs them.
