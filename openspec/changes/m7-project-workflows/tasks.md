# Tasks

**How the work is done:**
- **By hand:** 7.0 and 7.1.
- ***user*** marks work the user does on the cluster.
- **"After"** names the tasks each one waits on.

## 7. M7: a queue per project, and workflows a project owns

- [ ] 7.0 Docs for the move (design D8; after none). Done when:
  - the PRD has ORC-14 and a §0 row (ORC-2, ORC-7, ORC-14, PLT-8, §8), both approved by the user;
  - §8's Phase 0 row has M7 after M6;
  - `docs/site/prd.html` and `architecture.html` match the PRD;
  - `docs/plans/poc.md` has the M7 row and, under "Not in the POC", the project worker's shared ServiceAccount (a Role and pod labels per project);
  - `CLAUDE.md` lists `examples/`, `lib.workerImage` and `f8 run --flow <name>`, and says the queue is per repo;
  - the memory file notes M7.
- [ ] 7.1 Spike (by hand; design D4; after none). With a scratch directory holding an `index.ts` that imports `@factory8/worker/flow`, built into an image the way D1 describes, entry file included. Done when D4 records:
  - whether the bundler compiles `flow.ts` and `workflows.ts` reached through `node_modules`, and whether `app`'s `node_modules` has the `@factory8/worker` link;
  - if not, that the fallback (copy into `app/worker/project/`, a bundler alias) works.
- [ ] 7.2 `worker/src/flow.ts`, with ship.ts on it (design D3; `project-worker` spec, "Project workflows have Factory8's run building blocks"; after none). Done when:
  - ship.ts uses `run`, `ask` and `step` from `flow.ts`, and `worker/test/ship.test.ts` passes without edits;
  - `worker/test/flow.test.ts` runs a small workflow in the local test environment with mocked activities and covers: a step's create, start, poll and delete; a question that deletes the pod, shows in `state` and resumes after `answer`; `ask` between two steps with no sandbox in between;
  - `worker/package.json` exports `./flow` and `./workflows`.

  `npm test` and `npm run typecheck` pass.
- [ ] 7.3 A worker per repo's queue (design D2; `project-worker` spec, "Every project has its own task queue", "A worker serves the queues of its repos"; after none). Done when:
  - `worker/src/queue.ts` has `taskQueue(repo)`, with a test: `https://github.com/librepod/marketplace` → `factory8/librepod/marketplace`, and a URL that isn't a GitHub repo throws;
  - `worker/src/main.ts` bundles once from `FACTORY8_WORKFLOWS` (default `./workflows.ts`) and runs one worker per key of `FACTORY8_IMAGES`, and exits with an error when `FACTORY8_IMAGES` is unset or empty;
  - by hand against `temporal server start-dev`, with two repos in `FACTORY8_IMAGES`: `temporal task-queue describe` shows a poller on both queues and none on `factory8`.
- [ ] 7.4 `lib.workerImage` (design D1, D4; `project-worker` spec, "builds its worker image"; after 7.1, 7.2, 7.3). Done when:
  - `lib.workerImage` with a directory builds an image whose `FACTORY8_WORKFLOWS` is an entry file that re-exports the built-ins and that directory's `index.ts`;
  - `packages.worker-image` keeps the built-ins only, and `nix build .#worker-image` passes.
- [ ] 7.5 The example, `gatedWorkflow` (design D6; after 7.2, 7.4). Done when:
  - `examples/gated/index.ts` exists, and `examples/gated/test/gated.test.ts` covers `go` → build and `{ summary }`, anything else → `rejected` with the answer, and no sandbox during the wait;
  - `npm test` runs the example's test, and `npm run typecheck` covers the example;
  - `nix build .#example-worker-image` passes, and the image, run locally against `temporal server start-dev` with factory8/factory8 in `FACTORY8_IMAGES`, polls `factory8/factory8/factory8` and registers `sdlcWorkflow`, `shipWorkflow` and `gatedWorkflow`.
- [ ] 7.6 CLI: any flow on the repo's queue, the poller check, one result rule (design D5; `f8-cli` delta; after 7.3). Done when:
  - `cli/test/run.test.ts` covers `run 12` → flow `sdlc`, `run --flow gated 12` → flow `gated`, `run --flow ship 12` as before, and `run --flow 9-x 12` → usage;
  - the result rule is a pure function in `cli/src/run.ts`, with a test for `url`, `summary` and neither;
  - against a dev server with no worker on the queue, `f8 run 12` and `f8 run --flow gated 12` print `no worker serves factory8/factory8/factory8`, exit 1, and leave no workflow.

  The CLI tests and `npm run typecheck` pass.
- [ ] 7.7 Deploy (*user* + me; design D7, Migration Plan; after 7.4, 7.5, 7.6). Done when:
  - with no run in flight, the example's image is imported, `deploy/worker.yaml` (factory8/factory8 out of `FACTORY8_IMAGES`, 0 replicas) and `deploy/projects/factory8.yaml` are applied together;
  - `temporal task-queue describe --task-queue factory8/factory8/factory8` shows one poller, and `factory8` none;
  - the new `f8` is in use.
- [ ] 7.8 First runs on the project queue (after 7.7). Done when, on factory8/factory8:
  - `f8 run --flow gated <issue>` prints the plan stage, then the question; no sandbox pod exists while it waits; `f8 answer <run> go` resumes it; it builds and prints the summary;
  - a second gated run answered `no` ends with `rejected`;
  - `f8 run --flow ship <issue>` reaches its design step on the project worker;
  - `f8 run <issue>` in a clone of a repo no worker serves refuses to start;
  - the user merges or closes each PR.

## Workflow follow-up

- Archive M1 (`m1-issue-to-draft-pr`) and M6 before this change: M7 modifies `f8-cli`, which M1 adds and M6 extends.
- When 7.8 holds, archive this change (`/openspec-archive-change`).
