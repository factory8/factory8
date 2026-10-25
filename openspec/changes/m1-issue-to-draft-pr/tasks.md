# Tasks

The adapter (`f8-adapter` + `f8-ask`, the old task 1.0) is done: see the `agent-adapter` spec. "After" names the tasks each one waits on; *user* marks work the user does on the cluster or GitHub.

## 1. M1: issue → sandboxed agent → draft PR (by hand)

1.1, 1.2, 1.3 and 1.D can run in parallel; the facts from 1.1 and 1.2 feed 1.D.

- [x] 1.1 Cluster setup (*user* + me): Kata through the kata-deploy chart, from `deploy/` (design: facts, D2, D4); check NFS, including root's file ownership inside the VM and that a new PVC with a deleted PVC's name gets its old files back; check whether k3s enforces NetworkPolicy. Done when: the kata-deploy DaemonSet finishes without crash-looping; the kata drop-in survives a k3s restart; a pod with `runtimeClassName: kata` runs on the pilot cluster with an NFS PVC mounted, and its kernel differs from the host's; its start time is measured. Passed 2026-10-25 on the pilot cluster's new node; results in the design's facts and D4
- [x] 1.2 LiteLLM check (A13). The *user* installs LiteLLM from the LibrePod marketplace UI and creates a static key. Done when: one adapter step on the host runs through LiteLLM (through a port-forward) with that key. Passed 2026-10-25 with a temporary key of the user's and `glm-5.3` (design D8); the static key is created at 1.4
- [x] 1.3 Project image from the Nix dev shell (A14, design D3). Done when: `nix build` makes an OCI image (the factory8 dev shell + claude-code + git + gh + Node + the adapter and `f8-ask`), tagged with its Nix hash, and a step runs inside it under docker
- [x] 1.D M1 technical design: agree D1–D8 in design.md. Done when: the user has agreed each decision, the facts are recorded, the specs and tasks 1.4–1.9 match the design, and no code is written
- [ ] 1.4 Sandbox on the cluster (after 1.1, 1.2, 1.3, 1.D; design D2). The *user* creates the GitHub token and the Secret. Done when: the Secret exists; the image is imported with `k3s ctr images import` (D3); a Kata pod from the D2 spec (PVC at `/f8`, adapter as the main process, `imagePullPolicy: Never`) becomes Ready; a step started with `curl` from an in-cluster pod pushes a branch; root + `IS_SANDBOX` verified
- [ ] 1.5 Temporal + Postgres on the cluster (PLT-1; after 1.1, 1.D; design D4). Done when: the Postgres 17 Deployment and the Temporal chart (Postgres for both stores) are in `deploy/` and applied, and the `temporal` CLI reaches the server through a port-forward
- [ ] 1.6 Worker + one-step workflow in `worker/` (after 1.4, 1.5, 1.D; design D1, D7, D8). Done when: the workflow creates the PVC and pod, starts the step, polls until it exits, deletes the pod (the PVC stays) and returns the step's exit; workflow tests pass in Temporal's local mode with the dev shell's `temporal` (D7); the worker runs in the cluster from its Nix image (D4) with `TEMPORAL_ADDRESS`, `F8_MODEL` and `F8_IMAGES` (D8) and no GitHub token
- [ ] 1.7 `f8 run <issue>` in `cli/` (after 1.6, 1.D; design D5, D6). Done when: it builds the repo URL from `origin` whatever its form, renders the task prompt for the issue, starts the workflow under a new run ID and prints the agent's summary, which ends with the draft PR URL
- [ ] 1.8 First dogfooded run (after 1.7). Done when: an issue on factory8/factory8 becomes a draft PR through `f8 run`, and we merge it
- [ ] 1.9 Pilot run on `librepod/marketplace` (after 1.8). Done when: the same works on the pilot repo. Its `shell.nix` needs Node, and k3d needs Docker in the VM
- [ ] 1.10 Adapter: cancel kills the agent's whole process group (after none; before 1.6). Done when: `claude` is spawned in its own process group, cancel sends SIGTERM to the group, then SIGKILL after a grace period, and a test shows a child process of the agent doesn't outlive a cancel

## Workflow follow-up

- When 1.9 holds, archive the change (`/openspec-archive-change`), so its delta specs become `openspec/specs/`.
