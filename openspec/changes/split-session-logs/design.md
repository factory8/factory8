# Design

**Status:** proposed on 2026-11-21. The user asked for this:
- split the session logs from the workspace, and delete the workspace once its step's sandbox is gone;
- keep NFS for now, behind something that object storage can replace later;
- make it a change of its own, separate from M8.

## Context

See proposal.md for why. What exists now:
- **The step's PVC.**
  - Each step gets a PVC, `factory8-<runId>-<stage>`, in `factory8-sandboxes`, mounted at `/f8` (M5 D2). Its class is `nfs-client`, hard-coded in `createSandbox`.
  - That class has `reclaimPolicy: Retain` and `onDelete: retain`, so even deleting the PVC leaves its folder on the share.
  - The worker deletes only the pod, both when a step ends and when it asks a question. Its Role can't delete PVCs (`deploy/worker.yaml`); the project worker uses the same ServiceAccount.
- **The adapter's paths.**
  - `HOME=/f8/home`, so Claude Code writes its session to `/f8/home/.claude/projects/<encoded-cwd>/<uuid>.jsonl`.
  - The adapter keeps `request.json`, `events.jsonl`, `session`, `checkout`, `question.md` and `handoff.md` in `/f8/state`.
  - Both paths come from `ROOT` (`FACTORY8_ROOT`, default `/f8`), which the tests point at a temporary folder.
- **Who reads the logs.** Nobody in the code yet. M8's viewer and inbox (designed, not built) mount the share's `factory8-sandboxes` folder.

## Goals / Non-Goals

**Goals:**
- a kept step costs about what its logs weigh;
- readers depend on a PVC name and a folder tree, not on NFS;
- the logs are written straight to their volume, with no copying step and no delay, so deleting the workspace loses nothing.

**Non-Goals:**
- object storage (D5 describes how it would fit);
- retention on the log volume (ART-10);
- the viewer and the inbox themselves. M8 is revised to read this volume once this change is agreed.

## Decisions

### D1. One log volume, a subPath per step

**Proposed:**
- **The volume.** `deploy/sessions.yaml` adds a PVC, `factory8-sessions`, in `factory8-sandboxes`. It is ReadWriteMany with a nominal 20Gi request, of class `nfs-client` on the pilot cluster.
  - Under `nfs-client`, deleting this PVC by mistake keeps its folder.
  - Another installation picks any ReadWriteMany class.
- **The mount.** The sandbox pod mounts it with `subPath: <runId>-<stage>` at `/f8-logs`.
  - kubelet creates the folder on first use.
  - The pod's mount is that folder only, so a step sees no other step's session (DEP-11, the `run-workflow` spec's "A sandbox per step").
  - The step's next pod, after a question or a pod death, mounts the same folder.
- **The namespace.** It lives in `factory8-sandboxes`, because a pod can mount only PVCs in its own namespace. A reader (M8's viewer) runs there too.
- **Rejected:**
  - **a log PVC per step:** a reader would mount thousands of PVCs, or the NFS export again;
  - **mounting the export's folder from the sandbox** (an inline `nfs` volume): puts NFS into every sandbox's spec;
  - **object storage now:** the user wants NFS for now. The folder tree is what object storage would replace (D5);
  - **two subPath mounts nested in `/f8`** (`/f8/home/.claude/projects` and `/f8/state`): a mount inside another volume's mount, not tried under Kata, and two mounts where one does;
  - **`CLAUDE_CONFIG_DIR` on the log volume:** it moves all of Claude Code's config, `.claude.json` included, not only the transcripts.

### D2. The adapter writes straight onto the log volume

**Proposed:**
- **Paths.** `LOGS` is `${ROOT}-logs`, so `/f8-logs` in a sandbox, and a sibling of the temporary root in tests. No new variable is needed. `STATE` becomes `${LOGS}/state`.
- **The link.**
  - At start, the adapter creates `${LOGS}/projects` and `${HOME}/.claude`.
  - It links `${HOME}/.claude/projects` to `${LOGS}/projects` unless that path already exists.
  - Claude Code then writes each turn through the link, onto the log volume.
  - The link lives on the workspace PVC, so a restarted pod finds it.
- **Why all of `state` moves:**
  - AGT-11 counts the adapter's event log as a session log;
  - `state/session` names the step's session for readers;
  - the folder is small and holds nothing secret.
- **What doesn't change:** `workdir`'s refused owners (`home`, `state`, `plugin`) stay. `/f8/state` is no longer the adapter's, but refusing it costs nothing, and M8's spec lists it.
- **Rejected:**
  - **copying the logs at exit or on a timer:** a delay, a copy step to get right, and a window in which deleting the workspace loses turns;
  - **`STATE` kept on `/f8`:** the event log and the session ID would go with the workspace.

### D3. The workspace is deleted when its step ends

**Proposed:**
- **A new activity, `deleteWorkspace(runId, stage)`,** deletes the PVC.
  - The step's `finally` calls it after `deleteSandbox`, in `flow.ts` (ship and project flows) and in `workflows.ts` (M5's run).
  - The question path still calls only `deleteSandbox`, so a waiting step keeps its PVC (SBX-11).
- **Deleting right after the pod is safe.** Kubernetes's PVC protection holds the PVC until the terminating pod is gone; then the class frees the storage (D4).
- **Nothing is lost:**
  - the logs are already on the log volume (D2);
  - the work is on the run branch;
  - `used` refuses a stage name that comes back within a run, so no later step expects that PVC.
- **RBAC.** The worker's Role gains `delete` on PVCs. The project worker shares it.
- **A run that ends without its `finally`** (`temporal workflow terminate`) leaves its PVC, as it leaves its pod today (the shortcut note in `flow.ts`). Such PVCs are deleted by hand.
- **Rejected:**
  - **the adapter emptying its checkout at exit:** the adapter doesn't know whether the worker will retry the step on that PVC (M4), and an empty PVC object would still be left per step;
  - **deleting at run end:** PVCs would pile up for as long as the run lasts, and a run that dies without its cleanup would keep all of them.

### D4. A workspace StorageClass that frees its data

**Proposed:**
- **The class.** `deploy/sessions.yaml` also adds a StorageClass, `factory8-workspace`:
  - the pilot cluster's provisioner, `k8s-sigs.io/nfs-subdir-external-provisioner`;
  - `reclaimPolicy: Delete`;
  - `onDelete: delete`;
  - `nfs-client`'s `pathPattern`, `${.PVC.namespace}/${.PVC.name}`, so a step's folder on the share keeps its name while the step lives.
- **The worker asks for `factory8-workspace` by name.**
  - Another installation defines that class on its own storage: ReadWriteOnce is enough, deleting on reclaim, and networked on multi-node installs (SBX-15).
  - The name is the contract, so no variable is needed.
- **Rejected:**
  - **changing `nfs-client`:** a StorageClass's parameters can't be changed, and other apps on the cluster use it;
  - **a variable for the class name:** Factory8 owns this class name, so a variable would add nothing.

### D5. The folder tree is where object storage would plug in

The tree a reader sees is the one in the `sandbox` spec ("What a reader sees"):
- `<runId>-<stage>/projects/<encoded-cwd>/<uuid>.jsonl`;
- `<runId>-<stage>/state/`.

To move the logs to object storage later:
- the adapter uploads `/f8-logs` on a timer and at each exit, through a presigned URL from the worker (ART-12);
- a sidecar beside each reader fills the same tree from the bucket.

Readers don't change. None of this is built now.

### D6. The PRD (a proposal for the user to approve before it's written)

- **AGT-11:** "stay on the run's volume (the PVC), which outlives the run's sandboxes until retention removes it (SBX-15)" becomes "are written to the installation's session-log volume, in a folder per step that only that step's sandbox mounts, and stay there after the step's PVC is deleted, until retention removes them (ART-10)". The resume and terminal-copy sentences stay.
- **SBX-15:** "the run's PVC is kept for its session logs (AGT-11) until retention removes it (ART-10); the PVC storage class is chosen per installation and must be networked on multi-node installs" becomes "a step's PVC is deleted when its step ends, and kept while it waits on a human; its session logs are on the session-log volume (AGT-11). Both storage classes are chosen per installation: the PVC's is networked on multi-node installs, and the log volume's is ReadWriteMany".
- **PLT-9:** "kept on the run's volume (AGT-11)" becomes "kept on the session-log volume (AGT-11)", and "reads the volumes in place" becomes "reads that volume in place".
- **§12, the transcript risk row:** "PVC kept after the run only for session logs, until retention removes it" becomes "a step's PVC is deleted when the step ends; transcripts stay on the session-log volume until retention removes them".
- **A §0 row:** "Session logs on their own volume (AGT-11, SBX-15, PLT-9)". Its text: a kept PVC held about 400 times its logs, in checkout and caches; a step's PVC is now deleted when the step ends, and readers mount one volume instead of the NFS export.

## Risks / Trade-offs

- **subPath under Kata hasn't been tried.** → The first task checks it on the pilot cluster before anything else is built: a Kata pod writes to its subPath folder and sees no other folder.
- **One volume holds every step's logs.** A full or broken share stops every step. → That's the case today too: every PVC is on the same share.
- **An installation needs a ReadWriteMany class.** → NFS, CephFS, EFS, Azure Files and Longhorn all provide one. Without one, D5's object-storage path applies.
- **The log volume grows forever.** → About 0.5 MB per step, so 20Gi holds about 40,000 steps. Retention is ART-10.
- **A failed step's checkout is gone with its PVC.** Its uncommitted files can't be inspected afterwards. → Its session shows what it did, and the run branch holds what it pushed. Keeping a failed step's workspace for debugging is not in this change.
- **M8's viewer must run in `factory8-sandboxes`,** beside the untrusted sandboxes, to mount the volume. → In the POC no NetworkPolicy separates the namespaces anyway. M8's revision records it.
- **A step's agent can rewrite its own transcript.** → The same as today: the agent runs as root with its session on its own PVC.

## Migration Plan

1. *user*: run `kubectl apply -k deploy/`. This adds `sessions.yaml` (the class and the log PVC) and the Role's `delete` on PVCs.
2. *user*, when no run is active (`f8` shows none): import the new sandbox and worker images, and set their tags in `deploy/worker.yaml` and `deploy/projects/factory8.yaml`.
   - The rule is "no run active", not only "no run waiting", for this reason: a step resumed after the upgrade would look for its state in `/f8-logs/state`, find nothing, and start its session over. Its old session is on its old PVC.
3. **The PVCs kept from before** stay on `nfs-client`, untouched. To keep their sessions readable, the user can copy them on the NFS server, then delete the old PVCs and their folders:
   ```sh
   cd <export>/factory8-sandboxes
   for d in factory8-*/; do
     s=${d%/}; [ "$s" = factory8-sessions ] && continue
     t=factory8-sessions/${s#factory8-}
     mkdir -p "$t"
     cp -a "$s/home/.claude/projects" "$t/"
     cp -a "$s/state" "$t/"
   done
   ```

**Rollback:** go back to the old images. Logs written in the meantime stay on the log volume; their steps' PVCs are already gone.
