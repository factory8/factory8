# Design

**Status:** task 1.D done (2026-10-23): every section is **Decided**, agreed with the user. Each decision records why it was made, the rejected alternative, and anything still open.

## Context

See proposal.md for why. The adapter is built and tested on a host (`agent-adapter` spec). Nothing else exists yet: no worker, no CLI, no cluster deployment. The pilot cluster is single-node k3s on NixOS with an NFS provisioner for PVCs; see the facts below for what else it has. Kata was proven in an earlier POC, but not on this cluster. Port-forwarding to Kata pods doesn't work, so the worker must run in the cluster to reach the adapter.

## Goals / Non-Goals

**Goals:** the smallest path that makes `f8 run <issue>` end in a draft PR, on factory8/factory8 first and then `librepod/marketplace`.

**Non-Goals:** heartbeats, retries, waiting for answers, object storage, an image registry or build workflow (SBX-17, Phase 1), operators, and any hardening.

## Facts to collect first

| Fact | Answer |
|---|---|
| Is the agent-sandbox controller installed? Which version, and does it include the SandboxTemplate/SandboxClaim extensions? How is a Sandbox reached: a Service, an FQDN or the pod IP? | Not installed (latest release v1.0.8, API `v1beta1`), and no longer needed: dropped on 2026-10-23 in favour of plain Kata pods (D2) |
| Is Kata installed? | Yes (task 1.1, 2026-10-25): kata-deploy 4.3.1 with `deploy/kata-deploy.values.yaml` (D4), shims `qemu` and `qemu-runtime-rs`. RuntimeClass `kata` uses `kata-qemu-runtime-rs`. The guest kernel is 6.18.56, the host's 6.12.93. A VM gets 1 vCPU and about 1.9 GB by default, and the RuntimeClass adds 250m CPU and 320Mi of overhead. A pod starts in about 3 s once its image is cached, against about 1.9 s with runc |
| What else is on the pilot cluster? | It moved on 2026-10-25 to the user's stable node; the first one gets wiped for other work. Single-node k3s v1.34.12 (containerd 2.2.7) on NixOS 25.11, amd64, 4 CPUs and 32 GB. StorageClass `nfs-client` (reclaim policy `Retain`) is the only one, and it isn't marked as the default, so a PVC must name it. Flux manages the cluster (`flux-system`). cert-manager, OpenBao and external-secrets are installed, next to the user's other production services |
| How does NFS behave inside the VM? | The PVC reaches the VM over virtiofs; on the host it's NFS v4.2, served by the node itself. There's no root squash: root writes, `chown`s, `chmod`s, symlinks and renames, and its files are `0:0` on the share |
| Does a new PVC with a deleted PVC's name get its old files back? | Yes. The class has `pathPattern: ${.PVC.namespace}/${.PVC.name}` and `onDelete: retain`, so the new PVC gets a new PV but the same directory. The old PV stays `Released` until it's deleted by hand |
| Does k3s enforce NetworkPolicy? | Yes. A default-deny policy blocked pod-to-pod traffic and DNS, rejecting at once rather than timing out (tested with runc pods) |
| Is MinIO already running on the pilot cluster? | No, and the POC doesn't need it for session logs: they stay on the run's PVC (D1) |
| Is there an image registry? | No |
| What are LiteLLM's in-cluster URL and key? | Installed from the LibrePod marketplace (v1.106.3, 2026-10-25): Service `litellm` in namespace `litellm`, port 4000. Its models are `glm-5.3` and `glm-5.3-flash` (provider `anthropic/`); both answer `/v1/messages` with a `thinking` block before the text, so a small `max_tokens` can end before any text. The static key is created at task 1.4 and goes straight into the sandbox Secret |
| Does the Temporal TypeScript SDK support Node 24? | Yes. The SDK officially supports Node 20, 22 and 24 (SDK README, checked 2026-10-23) |

## Decisions

### D1. The workflow

Diagram: `docs/site/m1-run.svg` (source `m1-run.d2`).

**Decided (2026-10-23): the worker is dumb.**
- Its workflow and activities do two things only: manage the run's sandbox and talk to the adapter.
- Everything else belongs to the agent in the sandbox, which uses `gh` and does what the task prompt asks: it reads the issue, opens the draft PR (D6), and does any other forge work.
- The worker holds no GitHub token.
- **Why:** business logic in the worker invites more and more to be delegated to it.
- **Rejected:** a `getIssue` activity, an `openDraftPR` activity, or anything else that calls the forge from the worker.

**Decided (2026-10-23): the rest of D1, as drawn in the diagram.**
- **Shape:** one workflow, `runWorkflow({ runId, repo, prompt, profile? })`, on task queue `factory8`. `profile` is optional, and M1 never passes it: `startStep` then uses the installation default (D8). The workflow ID is the run ID. The result is the step's exit event: `done` with the agent's summary, `failed` with a reason, or `needs_input` with a question.
- **Activities:**
  1. `createSandbox`
  2. `startStep` (POST /steps)
  3. `pollStep` (long-polls `GET /steps/{id}/events` until an exit event)
  4. `deleteSandbox`, in a `finally` block
- **M1 settings:**
  - `pollStep` gets a long start-to-close timeout (about 2 h); heartbeats come in M2 (2.2).
  - One attempt and no retries; retries come in M4.
  - On `needs_input`, M1 fails the run, because M3 adds the wait.
- **Naming:**
  - **Decided:** the run ID doesn't depend on what started the run. Runs will start from more than issues, for example an ad-hoc prompt. The issue appears only in the prompt and in the PR body (`Fixes #12`).
  - **Decided (2026-10-23):** the run ID is 6 random lowercase letters and digits, e.g. `k3x9qa`, generated by whatever starts the run (`f8 run` in M1). Temporal rejects a duplicate workflow ID, so on that rare collision `f8 run` picks a new ID and starts again.
  - **Rejected:** the issue number in the ID (`12-k3x9`).
  - The branch is `f8/<runId>`.
  - The step ID is `${runId}.build.1` (`agent-adapter` spec, "Start a step").

**Decided (2026-10-23): session logs stay on the run's PVC (AGT-11).**
- Nothing is uploaded. The adapter no longer has `uploadLogs` or `logsUploadUrl` (archived change `2026-10-23-drop-session-log-upload`).
- The session `.jsonl` files are on the PVC already, because the adapter sets `HOME=/f8/home`.
- Checked on Claude Code 2.1.289: a fresh HOME holding only a copy of `.claude/projects` ran `claude -p --resume <id>` and recalled the session, even from another working directory.
- Restoring a session locally means copying its `.jsonl` into `~/.claude/projects/` and running `claude --resume <id>`.
- Resume brings back the conversation, not the working tree: only what the agent pushed survives.
- **Rejected:** uploading to object storage (MinIO) or any other store.

### D2. Sandboxes on Kubernetes

**Decided (2026-10-23): no agent-sandbox. The worker creates plain Kubernetes objects.**
- **Per run,** in namespace `f8-sandboxes`, a PVC and a Pod, both named `f8-<runId>`:
  - **The PVC:** on `nfs-client`, named explicitly because it isn't the default StorageClass; `ReadWriteOnce`, 10Gi. The worker never deletes it, because it holds the session logs (D1, AGT-11, SBX-15).
  - **The Pod:**
    - `runtimeClassName: kata`, the project image, and `f8-adapter serve` as the main process on port 7070;
    - the PVC at `/f8`, `envFrom` the Secret (`sandbox` spec), and a `tcpSocket` readiness probe on 7070;
    - labels `app: f8-sandbox` and `f8/run: <runId>`.
    - With the default `restartPolicy: Always`, a crashed adapter restarts in the same pod and reloads `/f8/state`.
- **Lifecycle:**
  - `deleteSandbox` deletes only the pod.
  - Suspend (M3) is the same delete, and resume creates the pod again on the same PVC.
  - M4's retry after a pod death is the same create.
- **The "project template"** is a function in the worker, `sandboxPod(runId, image)`. It holds the admin-owned settings: runtime class, port, volume and Secret (DEP-6).
  - The image for each repo comes from a JSON env var on the worker Deployment, `F8_IMAGES` (repo URL → image).
  - SBX-17's build workflow replaces it in Phase 1.
- **Access:** the worker uses `@kubernetes/client-node`, with a ServiceAccount and a Role in `f8-sandboxes`: create, get and delete on pods; create and get on PVCs.
- **Namespaces:** `factory8` holds Temporal, Postgres and the worker; `f8-sandboxes` holds the sandboxes.
- **Why** (research on 2026-10-23, v1.0.8 source):
  - agent-sandbox's core is a thin wrapper over these same objects (its suspend just deletes the pod), and it saves no worker code.
  - Its template layer needs workarounds: a claim requires a warm pool, and a template adds a NetworkPolicy by default that blocks the worker and DNS.
  - Its chart is unpublished, and Helm doesn't upgrade its CRDs.
  - Also, a Service name must start with a letter, so about 28% of random run IDs would fail as Sandbox names.
- **Rejected:**
  - agent-sandbox, with or without its extensions;
  - a StatefulSet scaled between 1 and 0 (it restarts pods Temporal didn't ask for, and it adds an ordinal to the PVC name);
  - a Job (a daemon never completes, and its retries duplicate Temporal's).
- **The way back:** if warm pools are needed (SBX-8, Phase 2), the pod spec moves unchanged into a Sandbox's `podTemplate`.

**Decided (2026-10-23): the address is the pod IP.**
- The worker waits for the pod to be Ready, then talks to `http://<status.podIP>:7070`.
- It re-reads the IP after each create.
- **Rejected:** a shared headless Service giving `<runId>.sbx.f8-sandboxes.svc`. It adds an object and DNS caching (CoreDNS caches negative answers for about 30 s) for no gain, since the worker is the only client.

### D3. The project image (A14)

**Decided (2026-10-23), as proposed:**
- **Build:** `pkgs.dockerTools.streamLayeredImage`. It's in nixpkgs, so it needs no extra flake input.
- **Contents:**
  - the dev shell's packages (`packages` and `nativeBuildInputs`, gathered with `buildEnv`);
  - claude-code (from nixpkgs, if it isn't too far behind upstream). The flake lock pins its version, and nixpkgs' wrapper already sets `DISABLE_AUTOUPDATER=1`, so the image needs nothing more. kagent also checks the CLI version at start; with the lock pinning it, that adds nothing;
  - git and gh;
  - Node, to run the adapter;
  - the adapter and `f8-ask`.
- **Known loss:** a dev shell's `shellHook` isn't carried into the image. Accept that for M1.
- **Built (task 1.3, 2026-10-24):** `flake.nix` has `lib.sandboxImage { pkgs, shell, name }` and `packages.<system>.sandbox-image` (`factory8-sandbox:<Nix hash>`, 1.2 GB). Learned while building it:
  - claude-code is unfree in nixpkgs, so the flake allows that one package (`allowUnfreePredicate`).
  - The image also gets stdenv's base tools (`stdenv.initialPath`: coreutils, grep, sed, find, tar …), which `nix develop` puts on the PATH but a shell's package list doesn't name. It also gets `/bin/sh`, CA certificates, an `/etc/passwd` with root, and `/tmp`.
  - The adapter is a `node main.ts` wrapper; it has no dependencies to install.
  - Under docker, a real step (Claude Code 2.1.303, haiku) cloned a local bare repo, pushed `f8/<runId>` with the `Factory8-Run` trailer, and left its session file under `/f8/home/.claude/projects`. Claude Code also added its own `Co-Authored-By` trailer and amended its commit to do so.
- **Where it's defined:** the factory8 flake exposes a function such as `lib.sandboxImage { pkgs, shell }`, so the same function later builds the image for `librepod/marketplace`, whose environment is a `shell.nix`.
- **Delivery:** built by hand on the laptop and loaded onto the single node with `k3s ctr images import`. No registry yet; the SBX-17 build workflow is Phase 1.
- **Tag:** the image's Nix store hash, with `imagePullPolicy: Never` on the pod. Each build gets a new tag, so an image in use never changes under a run. That's the digest pinning borrowed from ax, without a registry; `F8_IMAGES` (D2) names the tag.

**Rejected:**
- nix2container, which needs an extra flake input.
- Flox (researched 2026-10-24) in place of the Nix dev shell and `dockerTools`:
  - It can't read a `flake.nix` or `shell.nix` dev shell, so every repo, and the engineer's own shell with it, would move to `.flox/manifest.toml` (PRJ-1, PRJ-6).
  - Since 2026-10-20, every lock or install resolves through Flox's hosted catalog and needs a FloxHub login, a sandbox's included. A catalog of our own is Enterprise only (paid), which conflicts with single-tenant installs that share nothing.
  - Its imageless Kubernetes shim wraps runc, not Kata, and its source isn't public.
  - Its one gain, activation hooks running inside the container, `nix print-dev-env` can give us if the lost `shellHook` ever matters.
  - It stays a possible later environment provider (PRJ-8) for a repo that already has `.flox/`. That provider would need the repo's `manifest.lock` committed, since activating a locked environment needs no login.

### D4. Deployment

**Decided (2026-10-23): everything in `deploy/`, using vendor Helm charts where they're worth it.**
- **Third-party components** come from their vendors' Helm charts, installed by hand with `helm upgrade --install` and one values file per chart in `deploy/`.
- **Factory8's own resources** are plain YAML in `deploy/`, applied with `kubectl apply -k`: namespaces, RBAC, Postgres and the worker.
- **LiteLLM** is the exception: it's installed from the LibrePod marketplace UI.
- **Why:** vendor charts are maintained upstream, so we don't maintain their manifests ourselves. One folder, applied by hand, is the smallest setup that works.
- **Rejected for now:** our own chart, or Flux, even though Flux already manages the cluster. Later we'll wrap `deploy/` into a chart or something similar.

**Decided (2026-10-23): Postgres is a plain Deployment.**
- It runs `postgres:17-alpine` as one replica with `strategy: Recreate`.
- Its data is on a PVC on `nfs-client`.
- It has a Service `postgres` and a Secret holding `POSTGRES_PASSWORD`. Temporal is its only user.
- **Why:** it's a POC, so no operator.
- **Rejected:** CloudNativePG (an operator is overkill), and Bitnami (its free images have been frozen since 2025-08).

**Decided (2026-10-23): Temporal uses the vendor chart, with Postgres for both stores.**
- The chart is `temporal/temporal` (1.7.0, server 1.32.0). It no longer has subcharts, so there's no Cassandra, Elasticsearch, OpenSearch or Prometheus to turn off.
- Both datastores use `pluginName: postgres12` at `postgres:5432`, with the `postgres` user from the Secret.
- The chart's hook job creates the `temporal` and `temporal_visibility` databases (`createDatabase: true`, its default) and manages the schema.
- One replica per service, `numHistoryShards: 4` (it can't be changed after the first install), and the Web UI is on by default.
- **Rejected:** Elasticsearch or OpenSearch for visibility (overkill), and the old `auto-setup` image.

**Decided (2026-10-23): the rest of D4, as proposed.** From chart research and the 4.3.1 source; nothing tried on the cluster yet:
- **Kata: the `kata-deploy` chart** (4.3.1, `oci://ghcr.io/kata-containers/kata-deploy-charts/kata-deploy`).
  - Values: `k8sDistribution: k3s` and `runtimeClasses.createDefault: true`, which gives a RuntimeClass `kata`.
  - With k3s now at v1.34.12, the node has the containerd drop-in import this chart needs; it arrived in v1.34.6.
  - Known effects: it installs its own Kata binaries into `/opt/kata`, leaving the node's NixOS `kata-runtime` unused, and it restarts k3s once, which briefly takes the API down. It finds `modprobe` only in FHS paths, which matters only if the KVM and vhost modules aren't already loaded.
  - **An earlier spike on a NixOS laptop** (k3s 1.35, chart 3.31.0) hit three bugs. Reading the 4.3.1 source, all three look fixed, and task 1.1 confirmed it on the pilot cluster (2026-10-25): the install restarted k3s in 12 s without crash-looping (A), the drop-in survived a later k3s restart (B), and Kata pods run (C):
    - A: the DaemonSet restarted k3s with `nsenter … systemctl`, which isn't on NixOS's FHS paths, so it crash-looped. 4.3.1 talks to systemd over its private D-Bus socket instead (`binary/src/utils/systemd.rs`).
    - B: k3s regenerates `containerd/config.toml` on every start, dropping kata's import. 4.3.1 writes a `config-v3.toml.d` drop-in when k3s's config already imports that directory (`binary/src/config.rs`); the spike's fix was a symlink there.
    - C: the Go shim was a glibc binary, which NixOS's stub loader won't run. 4.3.1 builds the Go shims static and cgo-free, the Rust shims with musl, and QEMU static (`static-build/shim-v2/build.sh`). The spike's fix pointed the runtime at NixOS's own shim.
  - The default `kata` RuntimeClass now uses `qemu-runtime-rs` (the Go runtime is being deprecated). The spike ran `kata-clh`: about 3.5 s to start a pod and 172 MiB per idle VM. Kept: measured in 1.1 (see the facts).
  - `kubectl port-forward` doesn't reach a Kata pod: kubelet dials localhost in the host-side network namespace, not in the VM. The worker uses the pod IP (D2); to debug the adapter, `curl` from another pod or `kubectl exec`.
  - Fallback if it fails: the spike's workarounds, in its order (pause the DaemonSet, label the node, symlink the drop-in, point the runtime at NixOS's shim, restart k3s). After that, a `kata` runtime entry in the node's NixOS `services.k3s.containerdConfigTemplate`, pointing at the existing `kata-runtime`, plus our own RuntimeClass.
- **Worker:** an image built with Nix (Node + the worker code), imported with `ctr` like the project image, running as a Deployment.

**Risk:** Postgres on NFS. There's no `local-path` StorageClass on the cluster; accept NFS for the POC.

### D5. `f8 run <issue>`

**Decided (2026-10-23), as proposed:**
- **Where:** the `cli/` workspace, running on the user's laptop.
- **What it does:**
  1. Takes the repo from the `origin` remote of the current directory, and generates the run ID.
  2. Renders the task prompt. The prompt names the issue and asks the agent to read it with `gh issue view <n>` and resolve it. When it's done, the agent opens a draft PR (D6) and ends its summary with the PR's URL.
  3. Starts `runWorkflow` and waits for the result.
  4. Prints the agent's summary, which ends with the PR URL, or the failure reason. It exits non-zero on failure.
- **Reaching Temporal:** at `TEMPORAL_ADDRESS`, by default `localhost:7233`, through a `kubectl port-forward` that the user runs. Temporal's pods aren't Kata pods, so port-forward works.
- **The repo URL:** the CLI keeps only `owner/repo` from the remote and builds `https://github.com/owner/repo`, whatever the remote's form. An SSH remote with a host alias, such as marketplace's `git@github.com-work:librepod/marketplace.git`, works too. The adapter clones over HTTPS with `GH_TOKEN`, and `F8_IMAGES` (D2) is keyed by this URL. GitHub is the only forge in Phase 0.
- **The run ID:** generated as in D1; on a duplicate workflow ID it picks a new one and starts again.
- **Ctrl-C:** it only stops `f8 run` waiting; the run carries on. Cancelling a run isn't in M1, and `f8 watch` comes in M2.

### D6. The draft PR

**Decided (2026-10-23): the agent opens it** with `gh pr create --draft` from `f8/<runId>`, because the task prompt (D5) asks it to. The title is the issue's title; the body is its summary, `Run: <runId>` and `Fixes #<n>`, so merging the PR closes the issue.
- **Why:** the worker is dumb (D1).
- **Rejected:** an `openDraftPR` activity in the worker.

### D7. Code layout and tests

**Decided (2026-10-23), as proposed, with local mode:**
- **Workspaces:** `adapter/`, `worker/` (workflow, activities, worker main) and `cli/`.
- **Shared types:** move `StepRequest` and `StepEvent` into `adapter/src/types.ts`; the worker imports them with `import type`.
- **Tests:** workflow tests use `@temporalio/testing` (TestWorkflowEnvironment) with mocked activities. The first real run (1.8) is the end-to-end test.
- **Local mode:** `TestWorkflowEnvironment.createLocal()` with the dev shell's `temporal` binary (`server.executable: { type: 'existing-path' }`), so nothing is downloaded. Time-skipping mode downloads a native test server that may not run on NixOS, and mocked activities never wait out the 2-hour poll timeout anyway.

**Rejected:** a separate contracts package.

### D8. Installation settings

**Decided (2026-10-23), refined:**
- **Worker:** env vars on its Deployment: `TEMPORAL_ADDRESS` (Temporal's in-cluster address), `F8_MODEL` (the default model) and `F8_IMAGES` (D2). No config file, no `project.yaml`, and no GitHub token.
- **The default profile:** when a run has no `profile`, `startStep` sends `{ vendor: 'claude-code', model: F8_MODEL }`. The workflow can't read env vars itself (Temporal replays it), and `f8 run` on the laptop can't see the worker's.
- **`F8_MODEL` on the pilot cluster:** `glm-5.3`, through LiteLLM (task 1.2, 2026-10-25). Claude Code needs only `--model` for it: a step on the host with just `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` made 4 `/v1/messages` calls, all to that model, and pushed its commit in 27s.
- **Constants, not settings:** the sandbox namespace `f8-sandboxes` (D2) and the adapter port 7070.
- **Sandbox:** `GH_TOKEN` and LiteLLM's URL and key come from the Secret (`sandbox` spec).

## Risks / Trade-offs

- [A13: Claude Code through LiteLLM is unverified] → task 1.2 checks it on the host first.
- [A14: a Nix-built image under Kata is unverified] → tasks 1.3 (docker) and 1.4 (Kata).
- [`--dangerously-skip-permissions` as root needs `IS_SANDBOX=1`; the adapter sets it, untested in a VM] → task 1.4.
- [The agent holds a GitHub token and a LiteLLM key, and nothing stops a push to `master` on GitHub's free plan] → accepted for the POC on the author's own repos; #1.
- [The PR depends on the agent following the prompt; Phase 0 trusts its `done`] → if it forgets the PR, the summary shows it, and the prompt gets fixed.
