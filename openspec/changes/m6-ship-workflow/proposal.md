# M6: the ship run (design → tests → implement → graded review → diagnosis → ready PR)

## Why

M5's run is plan → build → review/fix: one reviewer, and a loop that gives up after two fix rounds without saying why. The dark-factory plugin shows a stronger shape that works in practice:
- the tests are written before the code, by a different agent from the implementer;
- the design and the tests are graded before anyone implements;
- graders cite evidence and rank findings, and only blocking findings send work back;
- each attempt runs on a stronger model;
- high-risk work gets two graders;
- a loop that doesn't converge is diagnosed and routed to the layer that is actually broken: the design, the tests, the harness, or a human.

M6 rebuilds that logic on Temporal. dark-factory keeps its state in git refs because its loops are stateless. Here the workflow holds the whole flow, and a human wait is a durable wait (ORC-5) instead of a parked task.

**The stage prompts become skills.** They change much more often than the workflow or the adapter, so they live in a Claude Code plugin, `factory8`, in this repo. Each step's prompt is a slash command, such as `/factory8:review 12 mode=code sha=…`. A prompt changes with a commit, not a worker deploy, and an engineer can run the same command in their own terminal.

M6 runs next to M5's `sdlcWorkflow`, which stays. It comes after M5 and before M2–M4. It takes M3's core (the answer signal, `f8 answer`, resuming a waiting step), because its escalations need it.

## What Changes

- **`f8 run --flow ship <issue>` starts a ship run**, a new workflow type, `shipWorkflow`. `f8 run <issue>` still starts M5's run. One issue is one task: there is no splitting.
- **A sandbox per step, as in M5:** every step, including every attempt and every reviewer, gets its own pod and PVC, `factory8-<runId>-<stage>-<n>`.
- **Stages:**
  1. **design:** commits `.factory8/runs/<runId>/design.md` and opens the draft PR. The design holds the acceptance rows (behaviour → test), the done-when criteria, the files, a risk of `low` or `high`, the decisions and assumptions, and test-first steps (BLD-1, ART-1).
  2. **design review:** a reviewer grades the design. Up to two rounds (MNT-6).
  3. **acceptance:** another sandbox writes the failing tests for each acceptance row and shows that they fail (TST-3, pulled forward and widened to every run).
  4. **tests review:** a reviewer grades the tests. Up to two rounds.
  5. **implement:** works test-first and never edits the acceptance tests. Each attempt runs on the next model in a ladder. The step may stop with a cause: A, the tests can't pass for a correct implementation; B, the design's premise is false; C, the issue is too big.
  6. **code review:**
     - one reviewer, or two in turn when the risk is `high`;
     - the reviewer runs the repo's checks first and quotes their output (TST-2);
     - it checks that the acceptance tests are unchanged;
     - findings are ranked, and only `blocker` and `critical` findings block.
  7. **rework and diagnosis:**
     - after two graded attempts fail, a diagnoser picks one cause from A to I;
     - the run routes on that cause: one more attempt, a tie-break reviewer, back to the tests or the design, a wait for a human, or an end with the reason (ORC-3).
  8. **finish:** posts the run's report on the PR and marks the PR ready only when every reviewer said `SHIP`. No agent merges, ever (G4, DEP-2).
- **Structured results:** every skill ends with one line of JSON, which the workflow validates and acts on. An invalid result parks the run.
- **Human waits (ORC-5, SBX-11, M3's core):**
  - A step that runs `f8-ask` suspends: its pod is deleted, its PVC is kept, and its question is posted on the PR.
  - The workflow waits for an `answer` signal, then resumes the step on its own PVC.
  - A diagnosis that needs a human decision waits the same way.
  - `f8 answer <run> "<text>"` sends the signal.
- **Run state is the workflow's:** a `state` query returns the stage, the attempt, the risk, the PR, the open question and every step's result. `f8 run --flow ship` prints stage changes and questions from it.
- **Models per stage and per attempt:** a worker setting, `FACTORY8_BANDS`, which the run reads once at its start (ORC-2, AGT-3). Any stage may use any model: each step's own sandbox keeps a review independent (DEP-11, relaxed 2026-11-04).
- **The adapter, changed once:**
  - the protocol preamble moves to the system prompt, so a prompt can start with a slash command;
  - a step can load the `factory8` plugin as it was at the run's start time.

  M5's steps behave as before.
- **A new directory, `plugin/`:** the `factory8` plugin, with skills `design`, `acceptance`, `implement`, `review` (modes `design`, `tests` and `code`), `diagnose` and `finish`.

Not in M6:
- splitting an issue into parallel tasks (BLD-5);
- auto-merge or auto-rebase (dark-factory's Land);
- deterministic checks run by the platform rather than by the reviewer (TST-2's platform form);
- a gateway rejecting test edits (TST-3's enforcement, hardening);
- visual scoring;
- a reward or usage report;
- `/answer` on the issue (stays in M3);
- a different vendor (AGT-8).

## Capabilities

### New Capabilities
- `ship-workflow`: the ship run's stages, routing, waits, models, results and run state.
- `factory8-plugin`: the `factory8` Claude Code plugin, meaning its skills, how a step invokes them, and the result each one returns.

### Modified Capabilities
- `agent-adapter`:
  - the preamble goes into the system prompt;
  - a `StepRequest` may name the plugin and a time, and the adapter loads the plugin as it was at that time.
- `project-detection`: "Skills and MCP servers from the checkout". Factory8 now adds its own plugin to ship steps. Added in M1's change, so M1 must be archived first.
- `f8-cli`: `f8 run --flow ship` and `f8 answer`. Added in M1's change, as above.

## Impact

- **Worker:**
  - new `worker/src/ship.ts` (the workflow, its constants and its routing) and `worker/src/results.ts` (parsing results, rendering commands);
  - `worker/src/activities.ts` gains `shipConfig` (reads `FACTORY8_BANDS` and `FACTORY8_PLUGIN`) and `answerStep`, and `startStep` keeps the request's profile when there is one;
  - M5's per-step sandbox activities are reused unchanged.
- **Adapter:** `adapter/src/main.ts` and `types.ts`. The sandbox image is rebuilt.
- **CLI:** `cli/src/main.ts` gains `--flow ship`, `f8 answer`, and printing from the state query.
- **Plugin:** new `plugin/`, holding `.claude-plugin/plugin.json` and `skills/*/SKILL.md`.
- **Deploy:** `deploy/worker.yaml` gains `FACTORY8_BANDS`, `FACTORY8_PLUGIN` and new image tags. A model ladder with a separate reviewer needs three models in LiteLLM, which has two today (*user*).
- **The pilot cluster:** a ship run leaves one PVC directory per step on the share, about 10 to 20; they are deleted by hand until ART-10.
- **Docs:**
  - PRD §0 row and §8: Phase 0 gains M6 and M3 shrinks; TST-3, TST-5 and MNT-6 are pulled forward in their agent-checked form;
  - `docs/site/prd.html` and `architecture.html`;
  - `docs/plans/poc.md`;
  - M3's proposal and tasks;
  - `CLAUDE.md`'s layout.
- **Merging** a ship PR also merges its `design.md` and the acceptance tests.
