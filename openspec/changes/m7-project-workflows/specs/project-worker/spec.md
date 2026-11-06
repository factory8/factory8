# Spec Delta

## Purpose

Gives every project its own task queue, served by the shared worker or by a worker the project builds, so a project can run workflows tailored to it without a release of Factory8's worker, adapter or CLI.

## ADDED Requirements

### Requirement: Every project has its own task queue
Every run of the repo `https://github.com/<owner>/<repo>` SHALL run on the task queue `factory8/<owner>/<repo>`, whatever its flow, built-in or the project's. Owner and repo SHALL be lowercase in the queue's name, whatever the case of the clone's remote. No run SHALL use a queue shared between projects.

#### Scenario: A built-in flow on the project's queue
- **WHEN** a ship run starts for librepod/marketplace
- **THEN** it runs on `factory8/librepod/marketplace`

#### Scenario: Two projects, two queues
- **WHEN** runs start for factory8/factory8 and for librepod/marketplace
- **THEN** they run on `factory8/factory8/factory8` and `factory8/librepod/marketplace`

#### Scenario: Remote in another case
- **WHEN** a run starts from a clone whose remote is `git@github.com:Factory8/Factory8.git`
- **THEN** it runs on `factory8/factory8/factory8`

### Requirement: A worker serves the queues of its repos
A worker SHALL poll the queue of each repo it has a sandbox image for, and no other queue. A worker with no repo, or with a repo whose URL isn't a lowercase GitHub repo URL, SHALL fail at start.

#### Scenario: Shared worker with two repos
- **WHEN** the shared worker starts with sandbox images for factory8/factory8 and librepod/marketplace
- **THEN** it polls `factory8/factory8/factory8` and `factory8/librepod/marketplace`

#### Scenario: A repo moved to its own worker
- **WHEN** librepod/marketplace's sandbox image moves from the shared worker's settings to its project worker's
- **THEN** after both are redeployed, only the project worker polls `factory8/librepod/marketplace`

#### Scenario: No repo
- **WHEN** a worker starts with no sandbox image set
- **THEN** it exits with an error that names the missing setting

#### Scenario: Repo in uppercase
- **WHEN** a worker starts with a sandbox image for `https://github.com/Factory8/Factory8`
- **THEN** it exits with an error that names that URL

### Requirement: A project builds its worker image from Factory8
Factory8 SHALL provide a way for a project's Nix flake to build a worker image from Factory8's worker and a directory of the project's workflows. The image SHALL register Factory8's built-in workflows and the workflows that directory exports, and no others. A project export with a built-in's name SHALL NOT replace the built-in.

#### Scenario: Project flake builds an image
- **WHEN** a project's flake builds a worker image from its `workflows/` directory, which exports `gatedWorkflow`
- **THEN** a worker started from that image registers `sdlcWorkflow`, `shipWorkflow` and `gatedWorkflow`

#### Scenario: Name taken by a built-in
- **WHEN** the project's directory exports a workflow named `shipWorkflow`
- **THEN** the image's `shipWorkflow` is Factory8's ship run

### Requirement: The image's workflows are bundled when it is built
A worker image SHALL hold its workflows already bundled. A workflow that can't be bundled SHALL fail the image's build, not the worker's start.

#### Scenario: Bad import
- **WHEN** a project's workflow imports a module the image doesn't have
- **THEN** building the image fails, naming the module

### Requirement: A worker image pins one Factory8 commit
A worker image SHALL carry the Factory8 commit it is built from: the built-in workflows and the plugin its runs load come from that commit. An image SHALL NOT build from a Factory8 tree with uncommitted changes.

#### Scenario: Project's pin
- **WHEN** a project's `flake.lock` pins Factory8 at commit `c` and the project builds its worker image
- **THEN** the image's built-in workflows are those of `c`, and its runs' steps load the plugin at `c`

#### Scenario: Uncommitted changes
- **WHEN** a worker image is built from a Factory8 tree with uncommitted changes
- **THEN** the build fails

### Requirement: A project worker runs only Factory8's activities
A project worker SHALL register Factory8's activities and no activity of the project's. A project workflow SHALL reach sandboxes and the adapter only through those activities.

#### Scenario: Same activities as the shared worker
- **WHEN** a project worker starts
- **THEN** the activities it registers are exactly the shared worker's

### Requirement: Project workflows have Factory8's run building blocks
Factory8 SHALL give project workflows the building blocks the ship run uses: a step in its own sandbox, a wait for a human answer that holds no pod (ORC-5, SBX-11), and the run's `state` query. A step that asks a question SHALL wait for the `answer` signal and resume on its own PVC, as in the ship run. Only one question SHALL wait at a time: a second one fails the run with type `bad_ask`.

#### Scenario: Question in a project run
- **WHEN** a step of a project run asks a question
- **THEN** the step's pod is deleted, the `state` query shows the question, and the step resumes after the `answer` signal

#### Scenario: Human gate in a project run
- **WHEN** a project workflow waits for a human between two steps
- **THEN** no sandbox pod exists while it waits, and the run continues with the answer after the `answer` signal

#### Scenario: Two questions at once
- **WHEN** a project workflow runs two steps at once and both ask a question
- **THEN** the run fails with type `bad_ask`

### Requirement: A stage names one step
A step's stage SHALL be a DNS label, at most 63 lowercase letters, digits and `-`, not used by an earlier step of the run. A step with any other stage SHALL fail the run with type `bad_stage` before any sandbox is created.

#### Scenario: Stage reused
- **WHEN** a project workflow starts a second step with stage `build` in one run
- **THEN** the run fails with type `bad_stage`, and no sandbox is created for that step

#### Scenario: Stage that can't name a pod
- **WHEN** a project workflow starts a step with stage `Build Step`
- **THEN** the run fails with type `bad_stage`

### Requirement: An error in workflow code fails the run
When a workflow's code throws an error, the run SHALL fail with the error's message, instead of retrying the workflow's task.

#### Scenario: Plain error
- **WHEN** a project workflow throws `new Error('no plan')`
- **THEN** the run fails with the message `no plan`

### Requirement: Workflows keep f8's run contract
Every workflow `f8` starts SHALL be named `<flow>Workflow`, take the input `runId`, `repo` and `issue`, and return an object. A workflow that waits for a human SHALL accept the `answer` signal and show the question in its `state` query.

#### Scenario: Started by f8
- **WHEN** `f8 run --flow gated 12` starts a run in a clone of factory8/factory8
- **THEN** `gatedWorkflow` runs on `factory8/factory8/factory8` with that run's ID, the repo and issue 12
