# M7: a task queue per project, and workflows a project owns

## Why

A project sometimes needs a flow that is its own: a human approval between the plan and the build, or a stage only it has. Today every workflow is platform code. It is compiled into the one worker, registered on the shared `factory8` task queue, and listed by name in `f8`. So a project's flow means a Factory8 release, and every project's quirks end up in Factory8's code. One shared queue also means every project's runs wait in the same line, on the same settings.

M7 gives every project its own task queue, and lets a project own its workflows:
- Every run of a repo, built-in or not, runs on that repo's queue.
- The shared worker serves the queues of the projects that have no worker of their own.
- A project that wants its own flows builds a worker image, with Factory8's worker and built-in flows underneath, and takes over its queue.

Factory8's adapter, activities and sandboxes stay the same. `f8` reaches any flow by name with one rule, with no release of Factory8 or of `f8`.

## What Changes

- **A task queue per project: BREAKING.**
  - Every run of `https://github.com/<owner>/<repo>` runs on `factory8/<owner>/<repo>`, whatever its flow.
  - The shared `factory8` queue goes away. The change deploys with no run in flight.
- **A worker serves the queues of the repos it's set up for.**
  - A worker polls one queue for each repo in its `FACTORY8_IMAGES`, all in one process.
  - Each repo is in exactly one worker Deployment's `FACTORY8_IMAGES`, so each queue has one owner. Moving a project to its own worker moves its line from one Deployment to the other.
- **A project worker image:**
  - The flake gains `lib.workerImage`, next to `lib.sandboxImage`. A project's flake takes Factory8 as an input and builds an image from Factory8's worker plus the project's own workflows directory.
  - The image registers Factory8's built-in flows, `sdlc` and `ship`, as well as the project's own, so every flow works on every queue. A project runs the built-ins at the Factory8 version its `flake.lock` pins.
  - It registers only Factory8's activities. A project adds workflows, never activities, so the worker stays dumb (M1 D1).
- **Building blocks for project flows:**
  - The run scaffolding that `shipWorkflow` already has moves into a module that project workflows import: a step in its own sandbox, a human wait on the `answer` signal (ORC-5), and the `state` query.
  - `shipWorkflow` moves onto it, with its behaviour and tests unchanged.
- **`f8 run --flow <name> <issue>`, one rule for every flow:**
  - It starts `<name>Workflow` on the repo's queue. `sdlc` is still the default, and `ship` still names the ship run.
  - If no worker polls that queue, `f8` says so and starts nothing.
  - `f8` watches every run through its `state` query when it has one, and prints the result's `url`, else its `summary`. `f8 answer` doesn't change.
- **The first project flow, dogfooded:** `examples/gated/` holds a flow that plans, waits for a human's go-ahead, then builds. Its image becomes factory8/factory8's own project worker, so this repo's ship runs go through it too.
- **Deploy:** one Deployment per project worker, applied by hand, with its image imported by hand, as for the shared worker.

Not in M7:
- activities written by a project, or any code of a project's that runs outside the workflow sandbox (a project worker runs only Factory8's activities);
- workflows loaded from a repo at runtime, without an image build;
- building the image in a Factory8 workflow (SBX-17, Phase 1);
- versioned deploys and replay tests (ORC-6, Phase 1). A worker redeploy, or moving a project between workers, still fails the runs in flight until M2 and M4;
- a check that no two Deployments serve the same repo;
- concurrency or rate limits per queue;
- an RBAC role per project worker (hardening, see Impact).

## Capabilities

### New Capabilities
- `project-worker`: the task queue every project has, which worker serves it, what a project provides to own workflows, how its worker image is built and what it registers, and the contract every workflow keeps with `f8`.

### Modified Capabilities
- `f8-cli`: `f8 run --flow <name>` takes any flow name and starts every flow on the repo's queue. It refuses to start when no worker serves that queue, and prints any run's result by one rule. M1's change adds this capability and M6's extends it, so both must be archived first.

## Impact

- **Worker:**
  - `worker/src/main.ts` bundles the workflows once and runs one Temporal worker for each repo in `FACTORY8_IMAGES`. The workflows path comes from the image's settings, with today's file as the default;
  - a new `worker/src/flow.ts` holds the scaffolding, and `worker/src/ship.ts` uses it;
  - `worker/package.json` exports the modules that project workflows and images import.
- **CLI:** `cli/src/run.ts` and `cli/src/main.ts`: any flow name, the repo's queue for every flow, the poller check, one watcher and one result rule.
- **Adapter:** none. The sandbox image doesn't change.
- **Nix:** `flake.nix` gains `lib.workerImage` and the example's image.
- **Deploy:**
  - `deploy/worker.yaml` loses factory8/factory8 from `FACTORY8_IMAGES`. With no other repo there yet, it runs with 0 replicas;
  - a new `deploy/projects/factory8.yaml` runs the example's image for factory8/factory8;
  - a project worker uses the shared worker's ServiceAccount, so a project's workflow code can create and delete any sandbox pod. Added under "Not in the POC".
- **Docs:**
  - PRD: a §0 row and a new ORC requirement for project queues and project workflows (ORC-2, ORC-7, PLT-8, §8). §4's "no custom workflow DSL" stays true: project flows are TypeScript, not a DSL;
  - `docs/site/prd.html` and `architecture.html`;
  - `docs/plans/poc.md`: the M7 row and the hardening gap;
  - `CLAUDE.md`'s layout and commands: `examples/`, `lib.workerImage`, `f8 run --flow <name>`.
