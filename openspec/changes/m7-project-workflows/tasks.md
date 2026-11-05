# Tasks

**How the work is done:**
- **By hand:** 7.0 and 7.1.
- ***user*** marks work the user does on the cluster.
- **"After"** names the tasks each one waits on.

## 7. M7: a queue per project, and workflows a project owns

- [x] 7.0 Docs for the move (design D8; after none). Done when:
  - the PRD has ORC-14 and a §0 row (ORC-2, ORC-7, ORC-14, PLT-8, SBX-17, §8), both approved by the user. The row also says the stage skills are pinned to the worker image's commit, not to the run's start as v0.5's M6 row says;
  - §8's Phase 0 row has M7 after M6;
  - `docs/site/prd.html` and `architecture.html` match the PRD;
  - `docs/plans/poc.md` has the M7 row and, under "Not in the POC", the project worker's shared ServiceAccount (a Role and pod labels per project);
  - `CLAUDE.md` lists `.factory8/workflows/`, `lib.workerImage` and `f8 run --flow <name>`, says the queue is per repo, and its `plugin/` line says a skill change reaches runs with the next worker image;
  - the memory files note M7, and the prompts-as-skills one says skills now ship with the worker image.
- [x] 7.1 Spike (by hand; design D4, D6; after none). From the pilot repo (`librepod/marketplace`, on a local branch), with Factory8 as a `git+file` input (a `path:` input has no commit for D9's pin) and a directory whose `index.ts` imports `@factory8/worker/flow`, build an image the way D1 describes, entry file and bundle included. Done when D4 records:
  - whether bundling runs in the Nix build sandbox, with webpack and swc from `app`;
  - whether `resolve.modules` reaches `@temporalio/workflow` and `@factory8/worker` from a directory outside `app`, and whether `app`'s `node_modules` has the `@factory8/worker` link;
  - if not, that the fallback (a copy next to a `node_modules` link to `app`'s) works;
  - that a worker started from the image loads the bundle.
- [x] 7.2 `worker/src/flow.ts`, with ship.ts on it (design D3; `project-worker` spec, "Project workflows have Factory8's run building blocks", "A stage names one step"; after none). Done when:
  - ship.ts uses `run`, `ask` and `step` from `flow.ts`, with `parseResult` as `step`'s `parse`, and `worker/test/ship.test.ts` passes without edits;
  - `worker/test/flow.test.ts` runs a small workflow in the local test environment with mocked activities and covers: a step's create, start, poll and delete, and its `{ stage, model, result }` record; a question that deletes the pod, shows in `state` and resumes after `answer`; `ask` between two steps with no sandbox in between; a reused stage and a stage that isn't a DNS label failing the run with `bad_stage` before any sandbox;
  - `worker/package.json` exports `./flow` and `./workflows`.

  `npm test` and `npm run typecheck` pass.
- [x] 7.3 A worker per repo's queue (design D2; `project-worker` spec, "Every project has its own task queue", "A worker serves the queues of its repos", "An error in workflow code fails the run"; after none). Done when:
  - `worker/src/queue.ts` has `taskQueue(repo)`, with a test: `https://github.com/librepod/marketplace` → `factory8/librepod/marketplace`, and a URL that isn't a lowercase GitHub repo URL throws;
  - `worker/src/main.ts` loads the bundle at `FACTORY8_WORKFLOW_BUNDLE`, or bundles `./workflows.ts` once without it, runs one worker per key of `FACTORY8_IMAGES` with `workflowFailureErrorTypes: { '*': ['Error'] }`, and exits with an error when `FACTORY8_IMAGES` is unset, empty, or has a key `taskQueue` rejects;
  - by hand against `temporal server start-dev`, with two repos in `FACTORY8_IMAGES`: `temporal task-queue describe` shows a poller on both queues and none on `factory8`.
- [x] 7.4 The plugin pinned to a commit (design D9; `agent-adapter` and `ship-workflow` deltas; after 7.2). Done when:
  - the adapter checks out the `StepRequest`'s `plugin.ref`, and `adapter/test/adapter.test.ts` covers a pinned commit that isn't the branch's latest, and an unknown ref failing the step with git's error;
  - `shipConfig` returns `plugin: { url, ref }` from `FACTORY8_PLUGIN` and `FACTORY8_PLUGIN_REF`, failing with `bad_bands` when either is unset, and the ship run passes it to every step;
  - `worker/test/ship.test.ts`'s plugin assertions check one `ref` for every step instead of one `at` (the only edit to that file);
  - `plugin/.claude-plugin/plugin.json` has no `version`.

  `npm test` and `npm run typecheck` pass.
- [x] 7.5 `lib.workerImage` (design D1, D4, D9; `project-worker` spec, "builds its worker image", "bundled when it is built", "pins one Factory8 commit"; after 7.1–7.4). Done when:
  - `worker/src/bundle.ts` bundles an entry to a file, as 7.1 settled;
  - `lib.workerImage` with a directory builds an image whose entry re-exports the built-ins by name and the directory's `index.ts`, whose `FACTORY8_WORKFLOW_BUNDLE` is the bundle, and whose `FACTORY8_PLUGIN_REF` is Factory8's commit; `pkgs` only picks the system;
  - `packages.worker-image` is `lib.workerImage` without a directory, and `nix build .#worker-image` passes;
  - by hand: a directory whose flow imports a missing module fails `nix build`, naming it; one that exports `shipWorkflow` leaves the built-in in place; a build from a tree with uncommitted changes fails.
- [ ] 7.6 The first project flow, `gatedWorkflow` (design D6; after 7.2, 7.5). Done when:
  - `.factory8/workflows/index.ts` exists, with its own plan and build prompts and no import outside its directory but `@factory8/worker/flow` and `@temporalio/workflow`;
  - `.factory8/workflows/test/gated.test.ts` covers `go` → build and `{ summary }`, anything else → `rejected` with the answer, and no sandbox during the wait;
  - `npm test` runs the flow's test, and `npm run typecheck` covers `.factory8/`;
  - `nix build .#project-worker-image` passes, and the image, run locally against `temporal server start-dev` with factory8/factory8 in `FACTORY8_IMAGES`, polls `factory8/factory8/factory8` and registers `sdlcWorkflow`, `shipWorkflow` and `gatedWorkflow`.
- [ ] 7.7 CLI: any flow on the repo's queue, the poller check, ending a run that can't start, one result rule (design D5; `f8-cli` delta; after 7.3). Done when:
  - `cli/test/run.test.ts` covers `run 12` → flow `sdlc`, `run --flow gated 12` → flow `gated`, `run --flow ship 12` as before, `run --flow 9-x 12` → usage, and `repoUrl('git@github.com:Factory8/Factory8.git')` → `https://github.com/factory8/factory8`;
  - the result rule is a pure function in `cli/src/run.ts`, with a test for `url`, `summary` and neither;
  - against a dev server with no worker on the queue, `f8 run 12` and `f8 run --flow gated 12` print `no worker serves factory8/factory8/factory8`, exit 1, and leave no workflow;
  - against a dev server with a worker on the queue, `f8 run --flow gatd 12` prints the worker's "no such function" error, terminates the run, and exits 1.

  The CLI tests and `npm run typecheck` pass.
- [ ] 7.8 Deploy (*user* + me; design D7, Migration Plan; after 7.5, 7.6, 7.7). Done when:
  - the change is merged, so `nix run` gives the new `f8`;
  - from the merged commit, factory8/factory8's sandbox image and the project worker image are built and imported, and their tags are in `deploy/projects/factory8.yaml`, whose Deployment has its own `app` label;
  - with no run in flight, `deploy/worker.yaml` (factory8/factory8 out of `FACTORY8_IMAGES`, 0 replicas) and `deploy/projects/factory8.yaml` are applied together;
  - a few minutes later, `temporal task-queue describe --task-queue factory8/factory8/factory8` shows one poller, and `factory8` none.
- [ ] 7.9 First runs on the project queue (after 7.8). Done when, on factory8/factory8:
  - `f8 run --flow gated <issue>` prints the plan stage, then the question; no sandbox pod exists while it waits; `f8 answer <run> go` resumes it; it builds and prints the summary;
  - a second gated run answered `no` ends with `rejected`;
  - `f8 run --flow ship <issue>` reaches its design step on the project worker, and while that step runs, `/f8/plugin` in its pod is at the image's `FACTORY8_PLUGIN_REF`;
  - `f8 run <issue>` in a clone of a repo no worker serves refuses to start;
  - the user merges or closes each PR.

## Workflow follow-up

- Archive M1 (`m1-issue-to-draft-pr`) and M6 before this change: M7 modifies `f8-cli`, which M1 adds and M6 extends, and `agent-adapter` and `ship-workflow`, which M6 extends and adds.
- When 7.9 holds, archive this change (`/openspec-archive-change`).
