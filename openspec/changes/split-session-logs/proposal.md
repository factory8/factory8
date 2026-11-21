# Split session logs from the workspace

## Why

Every step's PVC is kept after the step so that its session logs survive (AGT-11, SBX-15). Nothing deletes it.

On the pilot cluster's share, the logs are about 0.25% of what is kept: 10 kept steps hold 2.0 GB for 5 MB of logs. The rest is the checkout, `node_modules` and the npm cache. At about 200 MB a step, the share's 312 GB of free space runs out after roughly 1,500 steps, about 220 ship runs.

The readers of those logs also have a coupling problem. M8's viewer and inbox mount the NFS export directly, past the provisioner. They work only where every PVC is a folder of one NFS export, not on other storage.

## What Changes

- **A volume for session logs.**
  - It is one ReadWriteMany PVC, `factory8-sessions`, in `factory8-sandboxes`. Its storage class is the installation's choice; the pilot cluster uses `nfs-client`.
  - Each sandbox mounts only its own step's folder, `<runId>-<stage>`, at `/f8-logs`, so a step still sees no other step's session (DEP-11).
- **The adapter writes its logs there.**
  - `/f8/state` moves to `/f8-logs/state`.
  - `/f8/home/.claude/projects` becomes a link to `/f8-logs/projects`, so Claude Code writes its session files straight onto the log volume.
- **The workspace is deleted when its step ends.**
  - The worker deletes the step's PVC after its pod, whatever the step's outcome.
  - While the step waits on a question, the PVC stays, because resuming needs the checkout.
- **A workspace StorageClass that frees its data.**
  - `deploy/` gains `factory8-workspace`: the pilot cluster's NFS provisioner with `onDelete: delete`.
  - The worker asks for that class by name instead of the hard-coded `nfs-client`, and each installation defines it on its own storage.
- **What readers see** is a plain folder tree:
  - `<runId>-<stage>/projects/<encoded-cwd>/<uuid>.jsonl`, with subagents under `<uuid>/subagents/`;
  - `<runId>-<stage>/state/`.

  If the logs later move to object storage, only how this tree is filled changes, not what readers read.
- **PRD** (a proposal; the user approves it before it is written):
  - AGT-11, SBX-15, PLT-9 and the §12 transcript row say that the logs live on the session-log volume, and that a step's PVC is deleted when the step ends;
  - a §0 row records the change.

Not in this change:
- object storage for the logs (later; readers keep the same tree);
- retention on the log volume (ART-10);
- moving the PVCs kept from before (a manual copy, design D6).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sandbox`:
  - a step's PVC uses the `factory8-workspace` class and is deleted when its step ends;
  - the step's session logs are in its own folder on the session-log volume, which only that step mounts.
- `agent-adapter`: state and the vendor session files move to `/f8-logs`. This touches "State survives a pod restart" and "Filesystem layout".
- `run-workflow`: when a step ends, its pod and its PVC are deleted.

## Impact

- **Code:**
  - `worker/src/activities.ts`:
    - the sandbox pod mounts `factory8-sessions` with `subPath: <runId>-<stage>`;
    - the PVC asks for `factory8-workspace`;
    - a new `deleteWorkspace` activity.
  - `worker/src/flow.ts` and `worker/src/workflows.ts`: the step's `finally` also deletes the workspace.
  - `adapter/src/main.ts`: `STATE` moves, and the projects folder becomes a link.
  - Tests for both.
- **Deploy:** `deploy/sessions.yaml`, holding the StorageClass and the PVC, listed in `deploy/kustomization.yaml`. The worker and sandbox images are rebuilt.
- **Other open changes,** to revise once this one is agreed:
  - `m8-sessions-viewer`:
    - The viewer mounts `factory8-sessions` instead of the export. A PVC mounts only in its own namespace, so the viewer moves to `factory8-sandboxes`.
    - The inbox no longer reads the share.
    - Its `agent-adapter` delta drops "Filesystem layout", which this change carries.
  - `m2-progress-and-logs`: its restore check reads the log volume.
  - `m4-recovery`: at run end the workspace is no longer kept. Its retries stay within a step, on the same PVC.
- **Docs:**
  - the PRD rows above;
  - `docs/site/prd.html` and `architecture.html`, plus `arch.d2` if it shows the PVC holding the logs.
