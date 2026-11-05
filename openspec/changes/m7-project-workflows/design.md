# Design

**Status:** proposed 2026-11-04, revised 2026-11-05 twice: the queue per repo, then the review. Agreed with the user:
- option C from the research: workflows owned by a project, on a worker of its own;
- the project builds its own worker image, with Factory8 as a flake input;
- a task queue per repo for every run, built-in flows included, which `f8` derives from the clone (revised 2026-11-05);
- the `factory8` plugin pinned to the commit the worker image is built from (review, 2026-11-05);
- the workflows bundled when the image is built (review);
- in M7, a project's only check of its flows is `nix build` (review);
- a PRD row in this change;
- M7, after M6.

The decisions below are proposals until the user agrees them.

## Context

See proposal.md for why. What exists now:
- **The worker loads one workflows file and polls one queue.** `worker/src/main.ts` passes `workflowsPath: workflows.ts` and the `factory8` task queue to `Worker.create`. Temporal's bundler builds the workflow code when a worker is created, from that file and what it imports.
- **The activities are generic.** `createSandbox`, `startStep`, `pollStep`, `answerStep` and `deleteSandbox` take a run ID, a stage and a repo. None of them knows which workflow calls it. `shipConfig` is specific to the ship run.
- **`FACTORY8_IMAGES` already lists the repos a worker serves.** `createSandbox` fails a run for a repo that isn't in it.
- **The adapter is generic.** It runs a prompt with a profile on a repo, and optionally the plugin. It needs nothing for a new workflow.
- **The adapter treats a step ID it knows as started.** A step's pod and PVC are named `factory8-<runId>-<stage>` and its ID is `<runId>.<stage>.1`. A `StepRequest` whose ID matches the PVC's `request.json` gets 202 and nothing runs, and the PVC's event log still holds the earlier exit.
- **The plugin is pinned by time.** Each ship step's `plugin` is `{ url: FACTORY8_PLUGIN, at: <run start> }`, and the adapter checks out the last first-parent commit of the default branch made before `at` (M6 D4). So the workflow code ships with the worker image, and the skills with each commit.
- **The run scaffolding lives inside `shipWorkflow`.** Its local `step` (a sandbox per step, questions waiting with no pod), `ask`, the `answer` signal and the `state` query are closures in `worker/src/ship.ts`. M5's `step` in `workflows.ts` is an older copy, without waits.
- **An error thrown by workflow code fails the task, not the run,** unless it's an `ApplicationFailure`. Temporal retries the task forever.
- **`f8` knows two flows.** `parseArgs` accepts `sdlc` and `ship` only, and `main.ts` maps them to type names on the `factory8` queue. It watches the ship run through `state` and prints the SDLC run's `summary`.
- **The image is Nix.** `packages.worker-image` runs `node worker/src/main.ts` from `app`, a `buildNpmPackage` of the workspaces, built inside `packages` from Factory8's nixpkgs. `lib.sandboxImage` is already a function that a project's flake can call.
- **Node runs TypeScript by stripping types, and refuses to do so under `node_modules`.** Temporal's bundler compiles the workflow code itself, so this matters only for code the worker imports outside the bundle.

## Goals / Non-Goals

**Goals:**
- one routing rule: a repo's runs are on the repo's queue, whichever worker serves it;
- a project adds, changes or removes its flows with its own image build and deploy, and no change to Factory8;
- a project flow is short: the scaffolding it needs is imported, not copied;
- moving a project to its own worker changes nothing for its engineers;
- a run's workflow code and the skills it calls come from one Factory8 commit.

**Non-Goals:**
- running untrusted workflow code safely. A project worker is trusted like the shared one in the POC;
- a catalogue of which flows a project has. `f8` finds out when it starts one;
- flows shared between projects, other than by copying;
- fairness or limits between queues. Separate queues make them possible later;
- checking a project's flows in its own repo: no TypeScript setup there. In M7 a project's check is `nix build` of its worker image, which bundles its flows (D1).

## Decisions

### D1. The project builds the image: `lib.workerImage`

**Proposed:** `lib.workerImage { pkgs, name, workflows ? null }`. `pkgs` only picks the system: the worker's Node and npm dependencies are Factory8's `app`, from Factory8's own lock, so a project's nixpkgs can't change them. `workflows` is a directory with an `index.ts` that exports the project's workflows. The derivation:
1. writes an entry file that re-exports the built-ins by name, and the project's workflows:
   ```ts
   export { sdlcWorkflow, shipWorkflow } from '@factory8/worker/workflows';
   export * from '/nix/store/…-workflows/index.ts';
   ```
2. bundles it with Temporal's bundler (D4), so a bad import or a syntax error fails `nix build`. A type error doesn't: the bundler strips types without checking them;
3. builds the image with the bundle's path in `FACTORY8_WORKFLOW_BUNDLE`, and Factory8's commit in `FACTORY8_PLUGIN_REF` (D9).

Without `workflows`, the entry has the built-ins only: that's `packages.worker-image`, the shared worker's.

So every queue serves `sdlc` and `ship`, at the Factory8 commit the project's `flake.lock` pins. A project names its own workflows differently. In ES modules a named export takes precedence over `export *`, so a project export named `shipWorkflow` can't hide the built-in; the project's is hidden instead. A new built-in is added to the entry's first line. *shortcut: nothing reports a project export hidden by a built-in's name; make the bundle script fail on it when one confuses someone.*

A project's flake calls it as it calls `lib.sandboxImage`:

```nix
packages.worker-image = factory8.lib.workerImage { inherit pkgs; name = "marketplace-worker"; workflows = ./.factory8/workflows; };
```

The image's tag is its Nix hash, imported by hand, as for the shared worker (M1 D4).
- **Rejected:**
  - the shared image cloning the repo's workflows at start: the user chose an image the project builds. A build also pins the code a run starts on, and the bundler fails at build time rather than at a worker's start;
  - bundling at the worker's start (the first draft): a bad import would show only as a crash-looping pod, after the image is imported and deployed, and a project would have no earlier check;
  - `export *` for the built-ins too (the first draft): ES modules drop a name that two `export *` provide, with at most a webpack warning, so a project's `shipWorkflow` would remove ship from its queue;
  - a separate workflows repo per project: one more repo, and nothing needs it;
  - a project worker without the built-ins: its queue would then need a second worker for `sdlc` and `ship`, and two workers on one queue with different workflows fail each other's tasks (D2).

### D2. A worker serves one queue for each repo in `FACTORY8_IMAGES`

**Proposed:** `worker/src/main.ts`:
- loads the bundle at `FACTORY8_WORKFLOW_BUNDLE`. Without it (the dev shell, a local check), it bundles `./workflows.ts` once at start with `bundleWorkflowCode`. `Worker.create` with a `workflowsPath` would bundle again for every queue;
- creates one `Worker` for each key of `FACTORY8_IMAGES` on one `NativeConnection`. Each gets the bundle, the activities, the queue `taskQueue(repo)` and `workflowFailureErrorTypes: { '*': ['Error'] }`;
- runs them together. If one stops, the process exits and Kubernetes restarts it;
- fails at start when `FACTORY8_IMAGES` is unset or empty, as it does for the models (M5 D7), or when a key isn't a lowercase GitHub repo URL.

`workflowFailureErrorTypes: { '*': ['Error'] }` makes any error a workflow's code throws fail the run with its message, instead of failing the task forever (Context). A redeploy already fails the runs in flight in the POC, so waiting for a fixed deploy to heal the task gains nothing. It covers errors in a workflow's code, not an unknown workflow type, which fails before the workflow runs (D5).

`taskQueue(repo)` is a pure function in `worker/src/queue.ts` that turns `https://github.com/<owner>/<repo>` into `factory8/<owner>/<repo>`, and throws on anything else, uppercase included. `f8` imports it too, so the CLI and the worker can't disagree. `f8`'s `repoUrl` lowercases the owner and repo: GitHub ignores case, but a queue name and the `FACTORY8_IMAGES` lookup don't.

**Each repo is in exactly one Deployment's `FACTORY8_IMAGES`.** Temporal hands a queue's tasks to any worker that polls it. A worker without the run's workflow type fails the task, so two owners with different workflows would fail each other's runs. Nothing checks this rule; it's a deploy rule (Risks).
- **Rejected:**
  - a new setting listing the queues: it would have to agree with `FACTORY8_IMAGES`, and a queue without an image fails every run at its first step;
  - `FACTORY8_PROJECT`, one repo per project worker (the first draft): with the image map as the list, the shared worker and a project worker are the same program with different settings;
  - keeping the `factory8` queue for the built-in flows (the first draft): two rules in `f8`, and a project's built-in runs still on a shared line.

### D3. The scaffolding moves into `worker/src/flow.ts`

**Proposed:** `flow.ts` exports what `shipWorkflow` builds today as closures:
- `run(input)`, called once at the workflow's start: it registers the `answer` signal and the `state` query and returns the run's state, `ask` and `step`;
- `ask(question)`: sets the state's question, waits on the signal, returns the answer (ORC-5);
- `step(stage, prompt, opts)`: a sandbox per step, create, start, poll, delete in `finally`. On `needs_input` it deletes the pod, asks, recreates the sandbox and answers the step (M6 D10). `opts` carries the profile or the role, the plugin, and an optional `parse(summary)`. The step returns `parse(summary)`, or the summary without one, and then records `{ stage, model, result }` in the state. `model` is the profile's, and absent for a role, whose model the activity picks. A `parse` that throws ends the step unrecorded, as ship's `parseResult` does today.

A stage must be a DNS label (lowercase letters, digits and `-`, at most 63 characters) not used before in the run; otherwise `step` fails the run with type `bad_stage`, before any sandbox. A stage names the step's pod, PVC and step ID, so a reused stage would get the earlier step's exit back with no agent run (Context). Ship numbers its stages, so it never hits this.

The state's base shape is `{ stage, question?, steps: { stage, model?, result }[] }`, which is what `f8`'s watcher reads. A workflow adds its own fields. `RunState` in ship.ts extends it.

`shipWorkflow` uses `run`, passes `parseResult` as `parse`, and keeps `Ended` and its routing. Its tests in `worker/test/ship.test.ts` pass unchanged; they are the check that the move kept behaviour. D9 then changes only their plugin pin assertions. M5's `sdlcWorkflow` stays as it is: it fails on a question by design, and has no `state` query.

`worker/package.json` exports `./flow` (`src/flow.ts`) and `./workflows` (`src/workflows.ts`). A project workflow imports `@factory8/worker/flow` and nothing else from Factory8, plus `@temporalio/workflow`.
- **Rejected:**
  - leaving the scaffolding in ship.ts and copying it into each project flow: a fix to the question wait would have to reach every project;
  - a configurable workflow, such as stages from YAML: §4 excludes a workflow DSL, and the user asked for code;
  - numbering stages inside `step`: a project's stage names would no longer be what it sees in `f8` and on its pods.

### D4. The bundle resolves `@factory8/worker` from `app`'s `node_modules`

**Proposed:** `worker/src/bundle.ts <entry> <out>` calls `bundleWorkflowCode` with a `webpackConfigHook` that adds `app`'s `node_modules` to `resolve.modules`, and writes the code to `<out>`. `lib.workerImage` runs it in the image's build, with webpack and swc from `app` (dependencies of `@temporalio/worker`). So the entry and the project's directory stay where Nix put them, and webpack finds `@temporalio/workflow` and `@factory8/worker` in `app`. `@factory8/worker` is a workspace link, which webpack follows to `app/worker/src`, outside `node_modules`, so the bundler compiles it. A project's workflows may import only those two packages: the image doesn't install the project's npm dependencies.

**Spike (7.1, 2026-11-05): `resolve.modules` holds; no fallback needed.** The pilot's repo, `librepod/marketplace`, on a local branch, got a flake with Factory8 as a `git+file` input pinned with `?ref=m7-project-workflows`, and `.factory8/workflows/index.ts`, which imports `@temporalio/workflow` and `@factory8/worker/workflows` (`/flow` comes with 7.2; both are subpaths of the same `exports`). The prototype is `worker/src/bundle.ts` and `lib.workerImage`, as above.
- Bundling runs in the Nix build sandbox, with webpack and `@swc/core`'s native binding from `app`, in about 1.6 s.
- `resolve.modules` reaches both packages from the store paths of the entry and the project's directory. `app`'s `node_modules` has the `@factory8/worker` link (`../../worker`, as in the dev tree). Webpack follows it to `app/worker/src`, outside `node_modules`, so swc compiles it.
- The bundle's inline source maps name the entry and the project's directory, so both are in the image's closure. That's harmless and costs a few KB.
- The image's `FACTORY8_PLUGIN_REF` is the commit at the tip of the input's ref.
- A worker started in the image with `workflowBundle: { codePath: FACTORY8_WORKFLOW_BUNDLE }`, on queue `factory8/librepod/marketplace`, loads the bundle. The pilot's own flow completes. `sdlcWorkflow` gets past its first workflow task and schedules `createSandbox`. `gatdWorkflow` fails its first task with D5's "no such function is exported by the workflow bundle".
- **Rejected:**
  - copying the project's directory into `app` (the first draft): `app` is a store path, so it means a second `app` per project;
  - publishing `@factory8/worker` to a registry: the repo is private and nothing else needs it.

### D5. `f8 run --flow <name>`: one rule

**Proposed:**
- `parseArgs` accepts any name matching `^[a-z][a-zA-Z0-9]*$`, with `sdlc` as the default. The built-in names already fit `<name>Workflow`, so there's no table.
- Every run starts on `taskQueue(repo)`.
- Before starting, `f8` calls `DescribeTaskQueue` for the workflow task queue. With no poller, it prints `no worker serves <queue>` and exits 1. Temporal lists the workers that polled in the last few minutes, so a worker that just stopped still counts: the check catches a queue nobody serves, not a crash.
- `f8` watches every run with the ship run's watcher. A run with no `state` query, such as M5's, prints nothing until it ends. The result is printed by the rule in the `f8-cli` delta: `url`, else `summary`, else JSON. The ship run returns `url` and the SDLC run `summary`, so both print what they print today.
- **A run that can't start ends.** While it watches, when the run's history has a `WorkflowTaskFailed` before any `WorkflowTaskCompleted`, `f8` prints the failure's message, terminates the run and exits 1. Nothing has run yet, so terminating it loses nothing.
- `f8 answer` doesn't change: it signals the workflow ID, whatever the queue.

The poller check matters because Temporal accepts a start on a queue nobody polls: the run would sit with no worker and no error. A flow name that the queue's worker doesn't have fails the run's first workflow task with `Failed to initialize workflow of type 'gatdWorkflow': no such function is exported by the workflow bundle`. That fails before any workflow code runs, so D2's worker option doesn't turn it into a run failure, and Temporal retries the task forever. `f8` can't see the worker's types without a catalogue, but it sees that failure.
- **Rejected:**
  - `--queue` on every call: the user chose a queue derived from the repo;
  - a list of each project's flows in Factory8's config: it would make adding a flow a Factory8 change again;
  - a catalogue that `f8` checks before starting: config each project must keep in sync, when the first task's failure already names the problem.

### D6. The first project flow: `gatedWorkflow`, factory8/factory8's own

**Proposed:** `.factory8/workflows/index.ts`, where any project keeps its flows (D1), is a flow with a human gate between plan and build:
1. a `plan` step;
2. `ask` with the plan's summary and "Reply `go` to build, anything else to stop.";
3. a `build` step, when the answer is `go`. Otherwise the run fails with type `rejected` and the answer as its message.

It returns `{ summary }` from the build. It uses every building block of D3. Its plan and build prompts are its own, written in the file: a project's flows import only `@factory8/worker/flow` and `@temporalio/workflow` (D4), and so does this one.

`packages.project-worker-image` builds it with `lib.workerImage`, and that image becomes factory8/factory8's worker (D7). Its `sdlc` and `ship` runs exercise the built-ins through `lib.workerImage`.

This repo uses Factory8 as `self`, not as a flake input. So the spike (7.1) builds `lib.workerImage` from the pilot's repo, on a local branch with Factory8 as a `git+file` input, and the path a real project takes is built at least once.

Its test, `.factory8/workflows/test/gated.test.ts`, runs it in Temporal's local test environment with mocked activities, as `worker/test/ship.test.ts` does: `go` builds, `no` fails with `rejected`, and no sandbox exists during the wait. `npm test` and `npm run typecheck` reach it through the root `package.json` and `tsconfig.json`; neither looks into a dot directory by default.
- **Rejected:**
  - `examples/gated/`, importing M5's prompts from `worker/src` (the first draft): it's this repo's production worker, not an example; a relative import out of the directory breaks once `lib.workerImage` takes the directory alone; and it would break D4's rule;
  - a flow for the pilot repo first: it has no worker image or flake input yet, and this flow proves the same path on our own repo;
  - a scratch repo for the flow, keeping factory8/factory8 on the shared worker: one more repo and sandbox image, and the move to a project worker would go untested.

### D7. Deployments

**Proposed:**
- `deploy/worker.yaml`, the shared worker: factory8/factory8 leaves its `FACTORY8_IMAGES`, which is then empty. Until another repo is added, the Deployment has `replicas: 0`, with a comment saying why. Its multi-queue start is covered by a local check with two repos (7.3). It stays because one Factory8 deploy updates every repo it serves, code and skills together (D9), where a project worker waits for its project to rebuild.
- `deploy/projects/factory8.yaml`, listed in `deploy/kustomization.yaml`: Deployment `factory8-worker-factory8-factory8` in `factory8`, with its own `app` label so its selector doesn't overlap the shared worker's, ServiceAccount `factory8-worker`, the project worker image, and the shared worker's env: `TEMPORAL_ADDRESS`, `FACTORY8_MODEL`, `FACTORY8_REVIEW_MODEL`, `FACTORY8_BANDS`, `FACTORY8_PLUGIN`, and `FACTORY8_IMAGES` with factory8/factory8's sandbox image. The bundle and `FACTORY8_PLUGIN_REF` come with the image.

A project worker needs the bands and the plugin because it runs `ship` too. `deploy/projects/` holds this repo's worker only. A client project's worker Deployment belongs in that installation's own config, never in this repo, which holds no client data; a packaged install is Phase 4 (`docs/plans/poc.md`, "Not in the POC").
- **Rejected:**
  - a ServiceAccount and Role per project worker: the shared Role already limits a worker to pods and PVCs in `factory8-sandboxes`. What one would add is limiting a project to its own pods, which needs pods labelled by project and is hardening (Risks);
  - a Helm chart or a template: packaging is Phase 4.

### D8. The PRD row and the new requirement

**Proposed wording, for the user to approve in 7.0:**
- **ORC-14 ★:** Every project has its own task queue, and every run of the project, built-in flow or not, runs on it. A worker serves the queues of the projects it is set up for; each project's queue has one worker Deployment. A project may own workflows: TypeScript Temporal workflows in its repo, built with Factory8's worker and built-in flows into a project worker image that runs only Factory8's activities. A worker image pins the Factory8 commit its built-in flows and the `factory8` plugin's skills come from. `f8 run --flow <name>` starts any flow on the project's queue. A project's flows change with its own image, never with a Factory8 release. [0]
- **§0 row** in v0.6, citing ORC-2, ORC-7, ORC-14, PLT-8, SBX-17 and §8. It says:
  - the line "written by platform engineers with their agents" now also covers a project's engineers for that project's flows;
  - the stage skills are pinned to the worker image's commit, not to the run's start as v0.5's M6 row says, so a skill change ships with a worker image;
  - SBX-17's build workflow, when it lands, builds project worker images too;
  - §8's Phase 0 gains M7 after M6.
- ORC-6 (replay tests) and ORC-7 (child workflows) stay Phase 1, and apply to project workflows when they land.

### D9. The plugin is pinned to the worker image's commit

**Proposed:**
- `lib.workerImage` sets `FACTORY8_PLUGIN_REF` in the image to Factory8's commit, `self.rev`: the commit a project's `flake.lock` pins, or this repo's own. A build from a tree with uncommitted changes has no `self.rev`, and fails.
- `shipConfig` returns `plugin: { url, ref }` from `FACTORY8_PLUGIN` and `FACTORY8_PLUGIN_REF`, and fails with `bad_bands` when either is unset. It's an activity, so the run's history holds both.
- `StepRequest.plugin` becomes `{ url, ref }`. The adapter fetches the plugin's repo and checks out `ref`. A ref the repo doesn't have fails the step with git's error, as a clone failure does today. The adapter's shortcut for a commit pushed after the run's start goes with the time pin.
- The plugin's version is that commit. `plugin.json` loses its `version`, which nothing reads and nobody bumps.

So a run's workflow code, its result parsing and the skills it calls always come from one commit. A skill change reaches runs with the next worker image, for this repo too: M6 D3's "a commit changes the next run's prompts with no deploy" and its D4 time pin go. `claude --plugin-dir plugin` still tries a skill locally. The adapter changes, so every repo's sandbox image is rebuilt once (Migration Plan).
- **Rejected:**
  - the start-time pin (M6 D4): a project's pinned workflow code would parse the results of today's skills;
  - `at` set to the pinned commit's time, with no adapter change: it picks another commit for a branch build, or for two commits in the same second;
  - semver tags for the plugin: a release step, and a compatibility rule nobody checks, when the commit already ties the code and the skills together;
  - baking the plugin into the sandbox image: the sandbox and worker images are tagged and deployed separately, so they could pin different commits (M6 D3 rejected it too).

## Risks / Trade-offs

- **[Two Deployments serve one repo]** → their workers fail each other's tasks for any flow only one of them has, and a shared flow may run on either Factory8 version. Mitigation: the deploy rule in D2, and moving a repo only in one commit that edits both Deployments. A check at worker start would see the old pod during a rolling update, so it waits until this bites.
- **[A project runs its own version of `ship` and its skills]** → a fix to the ship run reaches a project worker only when the project updates its Factory8 input and rebuilds. That is the point of pinning, but Factory8 can't patch every project in one deploy. Factory8's own repo rebuilds both images from one flake, so it's always current.
- **[A skill change needs a worker deploy]** → in this repo too, a prompt tweak now costs a commit, an image build and import, and a tag edit. Accepted so that a run's code and skills always match; the build and import move into a Factory8 workflow with SBX-17 (Phase 1).
- **[An image built from a commit the plugin repo lacks]** (unpushed, or a fork's) → every step that loads the plugin fails at checkout, naming the ref. Build images from pushed commits.
- **[A redeploy, or a move between workers, fails the runs in flight]** → as for the shared worker until M2's heartbeats and M4's retries: `pollStep` has one attempt and no heartbeat. A run that continues on another worker's code may also fail Temporal's replay check. Deploy and move with no run in flight on that queue. Each queue's runs are its own, so other projects' runs carry on.
- **[A project workflow can touch any sandbox]** → it runs with the shared ServiceAccount, and `deleteSandbox` takes any run ID. (`createSandbox` refuses a repo outside its worker's `FACTORY8_IMAGES`.) Added to "Not in the POC": a Role per project worker, and pods labelled and checked by project.
- **[A type error in a project's flows reaches the image]** → the bundler doesn't typecheck, and a project has no other check in M7 (Non-Goals). The error shows as a failed run (D2) or a run `f8` ends at its first task (D5).
- **[A flow name the worker doesn't have]** → `f8` ends the run (D5). A run started another way, from the Temporal UI or an old `f8`, still retries its first task until someone terminates it.
- **[One process, many queues]** → one bad queue's error restarts the worker for every repo it serves. Acceptable at a handful of repos; split the Deployment when it isn't.
- **[The bundler and `node_modules`]** → the spike (7.1) settles D4 before anything else is built.
- **[Factory8 changes `flow.ts` and breaks a project]** → a project pins Factory8 through its `flake.lock`, so it picks up a change only when it updates the input and rebuilds. `flow.ts` is a contract from M7 on: a change to its exports is a breaking change, said in its commit.

## Migration Plan

1. Merge the change, so `nix run <this repo>#f8` gives the new `f8`. Until a worker polls the repo's queue, it refuses to start a run. An old `f8` would instead start runs on `factory8`, which nobody polls after step 3; today the only user is the user.
2. From the merged commit, build and import factory8/factory8's sandbox image (the adapter changed, D9) and the project worker image, and put both tags in `deploy/projects/factory8.yaml`.
3. With no run in flight, deploy both workers at once, in one `kubectl apply -k deploy/`:
   - the project worker image as factory8/factory8's worker;
   - the shared worker at 0 replicas, with factory8/factory8 out of its `FACTORY8_IMAGES`.
4. A few minutes later, once Temporal has dropped the old poller, check that `temporal task-queue describe --task-queue factory8/factory8/factory8` shows one poller, and `--task-queue factory8` none.

Rollback: re-apply the previous `deploy/`, which also restores the previous sandbox image tag, and use the previous `f8` (`nix run github:factory8/factory8/<previous commit>#f8`). Runs in flight on the new queue fail.

## Open Questions

- Whether `f8` should print the image tag of the worker that serves a run, for a run's provenance. It changes no spec, and can wait for the first time someone asks which code a run used.
