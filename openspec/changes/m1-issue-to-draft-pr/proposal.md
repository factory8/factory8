# M1: issue → sandboxed agent → draft PR

## Why

Factory8 can't build itself yet. M1 is the thinnest loop that lets it: a GitHub issue becomes a draft PR written by Claude Code in a sandbox. Every later change is then made through Factory8 runs (G11, PRD §8 Phase 0).

## What Changes

- `f8 run <issue>` (new `cli/` workspace) starts a run whose task prompt asks the agent to resolve the issue and open a draft PR, then prints the agent's summary with the PR URL.
- A Temporal worker (new `worker/` workspace) runs a one-step workflow: create a sandbox, start the step through the adapter, poll until it exits, delete the sandbox. The worker only manages sandboxes and talks to the adapter; all forge work is the agent's (design D1).
- Sandboxes on the pilot cluster: Kata, an image built from the repo's Nix dev shell (PRJ-8, SBX-16, A14), the adapter as the main process, an NFS PVC at `/f8`, and the POC credentials from a Secret (#1).
- Claude Code reaches models through LiteLLM (AGT-10, A13).
- Temporal and its own Postgres on the pilot cluster (PLT-1).
- The adapter is used as built (`agent-adapter` spec).

Session logs stay on the run's PVC after its sandbox is deleted (AGT-11). Not in M1: live progress (M2), waiting for answers (M3; a question fails the run), retries (M4), and hardening (`docs/plans/poc.md`).

## Capabilities

### New Capabilities
- `project-detection`: what a run takes from the repo and the installation; no `project.yaml` in Phase 0 (PRJ-1, PRJ-8).
- `sandbox`: a run's sandbox on Kubernetes: Kata, the project image, the adapter, the PVC and the POC credentials (SBX-3, SBX-12, SBX-16).
- `run-workflow`: a run of one agent step in its own sandbox (ORC).
- `f8-cli`: the `f8` command; M1 adds `f8 run` (PLT-5).

### Modified Capabilities
None.

## Impact

- New code: `worker/` and `cli/` workspaces, `deploy/` manifests, and an image function in `flake.nix` (see design.md).
- Pilot cluster: namespaces, Temporal, Postgres, and a Secret with `GH_TOKEN` and a LiteLLM key.
- New dependencies: the Temporal TypeScript SDK and a Kubernetes client (design D1, D2).
