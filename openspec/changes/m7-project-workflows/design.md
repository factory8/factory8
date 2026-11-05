# Design

**Status:** proposed 2026-11-04, revised 2026-11-05. Agreed with the user:
- option C from the research: workflows owned by a project, on a worker of its own;
- the project builds its own worker image, with Factory8 as a flake input;
- a task queue per repo for every run, built-in flows included, which `f8` derives from the clone (revised 2026-11-05);
- a PRD row in this change;
- M7, after M6.

The decisions below are proposals until the user agrees them.

## Context

See proposal.md for why. What exists now:
- **The worker loads one workflows file and polls one queue.** `worker/src/main.ts` passes `workflowsPath: workflows.ts` and the `factory8` task queue to `Worker.create`. Temporal's bundler builds the workflow code when a worker is created, from that file and what it imports.
- **The activities are generic.** `createSandbox`, `startStep`, `pollStep`, `answerStep` and `deleteSandbox` take a run ID, a stage and a repo. None of them knows which workflow calls it. `shipConfig` is specific to the ship run.
- **`FACTORY8_IMAGES` already lists the repos a worker serves.** `createSandbox` fails a run for a repo that isn't in it.
- **The adapter is generic.** It runs a prompt with a profile on a repo, and optionally the plugin. It needs nothing for a new workflow.
- **The run scaffolding lives inside `shipWorkflow`.** Its local `step` (a sandbox per step, questions waiting with no pod), `ask`, the `answer` signal and the `state` query are closures in `worker/src/ship.ts`. M5's `step` in `workflows.ts` is an older copy, without waits.
- **`f8` knows two flows.** `parseArgs` accepts `sdlc` and `ship` only, and `main.ts` maps them to type names on the `factory8` queue. It watches the ship run through `state` and prints the SDLC run's `summary`.
- **The image is Nix.** `packages.worker-image` runs `node worker/src/main.ts` from `app`, a `buildNpmPackage` of the workspaces. `lib.sandboxImage` is already a function that a project's flake can call.
- **Node runs TypeScript by stripping types, and refuses to do so under `node_modules`.** Temporal's bundler compiles the workflow code itself, so this matters only for code the worker imports outside the bundle.

## Goals / Non-Goals

**Goals:**
- one routing rule: a repo's runs are on the repo's queue, whichever worker serves it;
- a project adds, changes or removes its flows with its own image build and deploy, and no change to Factory8;
- a project flow is short: the scaffolding it needs is imported, not copied;
- moving a project to its own worker changes nothing for its engineers.

**Non-Goals:**
- running untrusted workflow code safely. A project worker is trusted like the shared one in the POC;
- a catalogue of which flows a project has. `f8` finds out when it starts one;
- flows shared between projects, other than by copying;
- fairness or limits between queues. Separate queues make them possible later.

## Decisions

### D1. The project builds the image: `lib.workerImage`

**Proposed:** `lib.workerImage { pkgs, name, workflows }`, where `workflows` is a directory with an `index.ts` that exports the project's workflows. It builds the same `app` as `packages.worker-image` and copies the directory into the image. It also writes an entry file that re-exports Factory8's built-in workflows and the project's, and sets `FACTORY8_WORKFLOWS` to that file:

```ts
export * from '@factory8/worker/workflows'; // sdlcWorkflow, shipWorkflow
export * from './project/index.ts';
```

So every queue serves `sdlc` and `ship`, at the Factory8 version the project's `flake.lock` pins. A project names its own workflows differently. `export *` silently drops a name both modules export, and TypeScript reports it as TS2308 in the project's typecheck. *shortcut: the build doesn't check for a name clash; add a check to `lib.workerImage` when one gets past a project's typecheck.*

A project's flake calls it as it calls `lib.sandboxImage`:

```nix
packages.worker-image = factory8.lib.workerImage { inherit pkgs; name = "marketplace-worker"; workflows = ./.factory8/workflows; };
```

The image's tag is its Nix hash, imported by hand, as for the shared worker (M1 D4).
- **Rejected:**
  - the shared image cloning the repo's workflows at start: the user chose an image the project builds. A build also pins the code a run starts on, and the bundler fails at build time rather than at a worker's start;
  - a separate workflows repo per project: one more repo, and nothing needs it;
  - a project worker without the built-ins: its queue would then need a second worker for `sdlc` and `ship`, and two workers on one queue with different workflows fail each other's tasks (D2).

### D2. A worker serves one queue for each repo in `FACTORY8_IMAGES`

**Proposed:** `worker/src/main.ts`:
- bundles the workflows once, from `FACTORY8_WORKFLOWS`, or `./workflows.ts` by default, with `bundleWorkflowCode`;
- creates one `Worker` for each key of `FACTORY8_IMAGES` on one `NativeConnection`. Each gets the bundle, the activities and the queue `taskQueue(repo)`;
- runs them together. If one stops, the process exits and Kubernetes restarts it;
- fails at start when `FACTORY8_IMAGES` is unset or empty, as it does for the models (M5 D7).

Bundling once matters: `Worker.create` with a `workflowsPath` bundles again for every queue.

`taskQueue(repo)` is a pure function in `worker/src/queue.ts` that turns `https://github.com/<owner>/<repo>` into `factory8/<owner>/<repo>`. `f8` imports it too, so the CLI and the worker can't disagree.

**Each repo is in exactly one Deployment's `FACTORY8_IMAGES`.** Temporal hands a queue's tasks to any worker that polls it. A worker without the run's workflow type fails the task, so two owners with different workflows would fail each other's runs. Nothing checks this rule; it's a deploy rule (Risks).
- **Rejected:**
  - a new setting listing the queues: it would have to agree with `FACTORY8_IMAGES`, and a queue without an image fails every run at its first step;
  - `FACTORY8_PROJECT`, one repo per project worker (the first draft): with the image map as the list, the shared worker and a project worker are the same program with different settings;
  - keeping the `factory8` queue for the built-in flows (the first draft): two rules in `f8`, and a project's built-in runs still on a shared line.

### D3. The scaffolding moves into `worker/src/flow.ts`

**Proposed:** `flow.ts` exports what `shipWorkflow` builds today as closures:
- `run(input)`, called once at the workflow's start: it registers the `answer` signal and the `state` query and returns the run's state, `ask` and `step`;
- `ask(question)`: sets the state's question, waits on the signal, returns the answer (ORC-5);
- `step(stage, prompt, opts)`: a sandbox per step, create, start, poll, delete in `finally`. On `needs_input` it deletes the pod, asks, recreates the sandbox and answers the step (M6 D10). It returns the exit's summary and records the step in the state. `opts` carries the profile or the role, and the plugin.

The state's base shape is `{ stage, question?, steps: { stage }[] }`, which is what `f8`'s watcher reads. A workflow adds its own fields. `RunState` in ship.ts extends it.

`shipWorkflow` uses `run`, and keeps result parsing, `Ended` and its routing. Its tests in `worker/test/ship.test.ts` pass unchanged; they are the check that the move kept behaviour. M5's `sdlcWorkflow` stays as it is: it fails on a question by design, and has no `state` query.

`worker/package.json` exports `./flow` (`src/flow.ts`) and `./workflows` (`src/workflows.ts`). A project workflow imports `@factory8/worker/flow` and nothing else from Factory8, plus `@temporalio/workflow`.
- **Rejected:**
  - leaving the scaffolding in ship.ts and copying it into each project flow: a fix to the question wait would have to reach every project;
  - a configurable workflow, such as stages from YAML: §4 excludes a workflow DSL, and the user asked for code.

### D4. The bundle resolves `@factory8/worker` from the image's `node_modules`

**Proposed:** `lib.workerImage` copies the project's directory into `app`, next to `node_modules`, so the bundler finds `@temporalio/workflow` and `@factory8/worker` (a workspace link) by walking up from the entry file. A project's workflows may import only those two packages: the image doesn't install the project's npm dependencies.

To be confirmed by the spike (7.1): the bundler compiles `flow.ts` and `workflows.ts` when it's reached through `node_modules`, and the workspace link exists in `app`'s `node_modules`. If it doesn't, the fallback is to copy the project's directory to `app/worker/project/` and import Factory8's modules by relative path in the entry, with the project importing `@factory8/worker/flow` through a `tsconfig` path for its own typecheck and the bundler given a matching alias. The spike records which one holds.
- **Rejected:** publishing `@factory8/worker` to a registry: the repo is private and nothing else needs it.

### D5. `f8 run --flow <name>`: one rule

**Proposed:**
- `parseArgs` accepts any name matching `^[a-z][a-zA-Z0-9]*$`, with `sdlc` as the default. The built-in names already fit `<name>Workflow`, so there's no table.
- Every run starts on `taskQueue(repo)`.
- Before starting, `f8` calls `DescribeTaskQueue` for the workflow task queue. With no pollers, it prints `no worker serves <queue>` and exits 1.
- `f8` watches every run with the ship run's watcher. A run with no `state` query, such as M5's, prints nothing until it ends. The result is printed by the rule in the `f8-cli` delta: `url`, else `summary`, else JSON. The ship run returns `url` and the SDLC run `summary`, so both print what they print today.
- `f8 answer` doesn't change: it signals the workflow ID, whatever the queue.

The poller check matters because Temporal accepts a start on a queue nobody polls: the run would sit with no worker and no error. A flow name that the queue's worker doesn't have fails the run's first workflow task. Temporal retries that task, so the run doesn't end on its own. `f8` can't see the worker's types without a catalogue. The user ends such a run with `temporal workflow terminate` (Risks).
- **Rejected:**
  - `--queue` on every call: the user chose a queue derived from the repo;
  - a list of each project's flows in Factory8's config: it would make adding a flow a Factory8 change again.

### D6. The example: `gatedWorkflow`, factory8/factory8's own project worker

**Proposed:** `examples/gated/index.ts` is a flow with a human gate between plan and build:
1. a `plan` step, with M5's plan prompt;
2. `ask` with the plan's summary and "Reply `go` to build, anything else to stop.";
3. a `build` step, with M5's build prompt, when the answer is `go`. Otherwise the run fails with type `rejected` and the answer as its message.

It returns `{ summary }` from the build. It uses every building block of D3. It imports M5's prompts relative to its own directory, which is fine inside Factory8's repo; a real project writes its own.

`packages.example-worker-image` builds it with `lib.workerImage`, and that image becomes factory8/factory8's worker (D7). So this repo moves to a project worker exactly as any project would, and its `sdlc` and `ship` runs exercise the built-ins through `lib.workerImage`.

Its test, `examples/gated/test/gated.test.ts`, runs it in Temporal's local test environment with mocked activities, as `worker/test/ship.test.ts` does: `go` builds, `no` fails with `rejected`, and no sandbox exists during the wait.
- **Rejected:**
  - a flow for the pilot repo first: it has no worker image or flake input yet, and the example proves the same path on our own repo;
  - a scratch repo for the example, keeping factory8/factory8 on the shared worker: one more repo and sandbox image, and the move to a project worker would go untested.

### D7. Deployments

**Proposed:**
- `deploy/worker.yaml`, the shared worker: factory8/factory8 leaves its `FACTORY8_IMAGES`, which is then empty. Until another repo is added, the Deployment has `replicas: 0`, with a comment saying why. Its multi-queue start is covered by a local check with two repos (7.3).
- `deploy/projects/factory8.yaml`, listed in `deploy/kustomization.yaml`: Deployment `factory8-worker-factory8-factory8` in `factory8`, with ServiceAccount `factory8-worker`, the example's image, and the shared worker's env: `TEMPORAL_ADDRESS`, `FACTORY8_MODEL`, `FACTORY8_REVIEW_MODEL`, `FACTORY8_BANDS`, `FACTORY8_PLUGIN`, and `FACTORY8_IMAGES` with factory8/factory8's sandbox image.

A project worker needs the bands and the plugin because it runs `ship` too. A second project copies the file and changes its name, image and `FACTORY8_IMAGES`.
- **Rejected:**
  - a ServiceAccount and Role per project worker: the shared Role already limits a worker to pods and PVCs in `factory8-sandboxes`. What one would add is limiting a project to its own pods, which needs pods labelled by project and is hardening (Risks);
  - a Helm chart or a template: packaging is Phase 4.

### D8. The PRD row and the new requirement

**Proposed wording, for the user to approve in 7.0:**
- **ORC-14 ★:** Every project has its own task queue, and every run of the project, built-in flow or not, runs on it. A worker serves the queues of the projects it is set up for; each project's queue has one worker Deployment. A project may own workflows: TypeScript Temporal workflows in its repo, built with Factory8's worker and built-in flows into a project worker image that runs only Factory8's activities. `f8 run --flow <name>` starts any flow on the project's queue. A project's flows change with its own image, never with a Factory8 release. [0]
- **§0 row** in v0.6, citing ORC-2, ORC-7, ORC-14, PLT-8 and §8. It says that the line "written by platform engineers with their agents" now also covers a project's engineers for that project's flows, and that §8's Phase 0 gains M7 after M6.
- ORC-6 (replay tests) and ORC-7 (child workflows) stay Phase 1, and apply to project workflows when they land.

## Risks / Trade-offs

- **[Two Deployments serve one repo]** → their workers fail each other's tasks for any flow only one of them has, and a shared flow may run on either Factory8 version. Mitigation: the deploy rule in D2, and moving a repo only in one commit that edits both Deployments. A check at worker start would see the old pod during a rolling update, so it waits until this bites.
- **[A project runs its own version of `ship`]** → a fix to the ship run reaches a project worker only when the project updates its Factory8 input and rebuilds. That is the point of pinning, but Factory8 can't patch every project in one deploy. Factory8's own repo rebuilds both images from one flake, so it's always current.
- **[A redeploy, or a move between workers, fails the runs in flight]** → as for the shared worker until M2's heartbeats and M4's retries: `pollStep` has one attempt and no heartbeat. A run that continues on another worker's code may also fail Temporal's replay check. Deploy and move with no run in flight on that queue. Each queue's runs are its own, so other projects' runs carry on.
- **[A project workflow can touch any sandbox]** → it runs with the shared ServiceAccount, and `createSandbox` and `deleteSandbox` take any run ID. Added to "Not in the POC": a Role per project worker, and pods labelled and checked by project.
- **[A flow name the worker doesn't have]** → the run retries its first workflow task forever, with the error in the Temporal UI. The user terminates it. A catalogue would let `f8` check first, but it would be config the project must keep in sync, so it waits until this bites.
- **[One process, many queues]** → one bad queue's error restarts the worker for every repo it serves. Acceptable at a handful of repos; split the Deployment when it isn't.
- **[The bundler and `node_modules`]** → the spike (7.1) settles D4 before anything else is built.
- **[Factory8 changes `flow.ts` and breaks a project]** → a project pins Factory8 through its `flake.lock`, so it picks up a change only when it updates the input and rebuilds. `flow.ts` is a contract from M7 on: a change to its exports is a breaking change, said in its commit.

## Migration Plan

1. With no run in flight, deploy both at once, in one `kubectl apply -k deploy/`:
   - the example's image as factory8/factory8's worker;
   - the shared worker at 0 replicas, with factory8/factory8 out of its `FACTORY8_IMAGES`.

   The `factory8` queue has no poller from then on.
2. Check with `temporal task-queue describe --task-queue factory8/factory8/factory8` that one worker polls it.
3. Release the new `f8`. An old `f8` would start runs on `factory8`, where nobody polls. It fails at once only with the new `f8`'s check, so everyone updates: today that's the user.

Rollback: re-apply the previous `deploy/` and use the previous `f8`. Runs in flight on the new queue fail.

## Open Questions

- Whether `f8` should print the image tag of the worker that serves a run, for a run's provenance. It changes no spec, and can wait for the first time someone asks which code a run used.
