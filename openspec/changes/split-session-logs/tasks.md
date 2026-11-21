# Tasks

**How the work is done:** by hand. ***user*** marks work the user does on the cluster. "After" names the tasks each one waits on.

## 1. Check subPath under Kata

- [x] 1.1 Try subPath under Kata on the pilot cluster (design D1, Risks; after none).
  - **Setup.** In a scratch namespace, create a throwaway ReadWriteMany PVC on `nfs-client`. Two Kata pods mount it with `subPath: a` and `subPath: b` at `/f8-logs`.
  - **Done when** D1 records that:
    - each Kata pod's file lands in its own folder;
    - pod `a` can't see `b`;
    - a file that pod `a` writes through a link `/root/.claude/projects → /f8-logs/projects` lands in `a/projects/`;
    - a runc pod that mounts the whole PVC read-only sees `a/` and `b/`.
  - Then delete the scratch namespace. If any check fails, stop and revise D1 with the user.

## 2. Docs

- [x] 2.1 PRD and site (design D6; after 1.1).
  - The user approves D6's wording. It is then written to `docs/PRD.md`: AGT-11, SBX-15, PLT-9 and the §12 row, plus a §0 row.
  - `docs/site/prd.html` and `architecture.html` match.
  - `docs/site/arch.d2` shows the log volume apart from the step's PVC, with the viewer reading the log volume, re-rendered to `arch.svg`.
  - **Done when** `git diff docs/` shows these edits and nothing else.

## 3. Other open changes

- [ ] 3.1 Revise the changes this one touches, with `/openspec-update-change` (after 1.1).
  - **`m8-sessions-viewer`:**
    - D2's farm links `/sessions/*/projects/*/` from `factory8-sessions`, mounted read-only;
    - the viewer runs in `factory8-sandboxes`, with no `nfs` volume;
    - D5's inbox finds the session ID without the share;
    - its `agent-adapter` delta drops "Filesystem layout";
    - 8.5 and 8.6 wait on this change.
  - **`m2-progress-and-logs`:** its restore check reads the log volume.
  - **`m4-recovery`:** at run end a step's workspace is no longer kept.
  - **Done when** `openspec validate` passes for each.

## 4. Deploy manifests

- [x] 4.1 The class, the log volume and the Role (design D1, D3, D4; after 1.1).
  - `deploy/sessions.yaml` has the StorageClass `factory8-workspace` and the PVC `factory8-sessions`, with a comment each on why. It is listed in `deploy/kustomization.yaml`.
  - The Role in `deploy/worker.yaml` gains `delete` on `persistentvolumeclaims`.
  - **Done when** `kubectl kustomize deploy/` renders both objects and the Role's `delete`.

## 5. Adapter

- [x] 5.1 Logs on `/f8-logs` (design D2; `agent-adapter` delta; after 1.1).
  - `adapter/src/main.ts` sets `LOGS` to `${ROOT}-logs` and `STATE` to `${LOGS}/state`. At start it creates `${LOGS}/projects` and links `${HOME}/.claude/projects` to it, unless that path exists.
  - `adapter/test/adapter.test.ts` checks that:
    - a fresh start creates `<root>-logs/state`, `<root>-logs/projects` and the link;
    - a session file the fake CLI writes under `$HOME/.claude/projects` is in `<root>-logs/projects`;
    - a restarted adapter reloads its state from `<root>-logs/state`, keeps the link, and resumes the recorded session;
    - the existing tests pass with the new state path.
  - **Done when** `npm test`, `npm run typecheck` and `nix build .#sandbox-image` pass.

## 6. Worker

- [x] 6.1 The log mount, the class, and deleting the workspace (design D1, D3, D4; `sandbox` and `run-workflow` deltas; after 1.1).
  - In `worker/src/activities.ts`:
    - `sandboxPod` mounts `factory8-sessions` with `subPath: <runId>-<stage>` at `/f8-logs`;
    - `createSandbox` asks for `factory8-workspace`;
    - `deleteWorkspace(runId, stage)` deletes the PVC and ignores a 404.
  - The step's `finally` in `worker/src/flow.ts` and `worker/src/workflows.ts` calls `deleteWorkspace` after `deleteSandbox`.
  - **Tests:**
    - `worker/test/activities.test.ts` checks the mount, the subPath and the class;
    - `worker/test/flow.test.ts` checks that a step ending `done` or `failed` deletes the pod, then the PVC;
    - it also checks that a question deletes only the pod, and that the step's PVC goes when it ends after the answer.
  - **Done when** `npm test` and `npm run typecheck` pass.

## 7. On the pilot cluster

- [ ] 7.1 Deploy and check (*user* + me; design Migration Plan; after 4.1, 5.1, 6.1).
  - *user*: Migration Plan steps 1 and 2.
  - **Done when,** on a ship run on factory8/factory8 started after the deploy:
    - while a step runs, its session grows under `factory8-sessions/<runId>-<stage>/projects/` on the share;
    - when a step ends, its PVC and its folder on the share are gone, and its logs stay;
    - a step that waits on a question keeps its PVC until it ends after the answer;
    - a finished step's session, copied into `~/.claude/projects/`, resumes with `claude --resume <id>`.
- [ ] 7.2 *user*, optional: copy the PVCs kept from before into the log volume, then delete them (Migration Plan step 3; after 7.1).
  - **Done when** `ls <export>/factory8-sandboxes` shows only `factory8-sessions` and the PVCs of active steps.

## Workflow follow-up

- Archive this change once 7.1 holds (`/openspec-archive-change`). Its `agent-adapter` delta carries "Filesystem layout", so 3.1 must have removed that requirement from M8's delta first.
