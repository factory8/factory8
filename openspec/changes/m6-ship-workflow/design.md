# Design

**Status:** proposed 2026-10-29. Agreed with the user:
- a second workflow, modelled on the dark-factory plugin, that coexists with M5's;
- `f8 run --flow ship <issue>` as the trigger;
- stage prompts as skills in a `factory8` plugin, invoked as slash commands;
- the workflow holds the flow, with no git-ref bookkeeping;
- one issue is one task;
- the code reviewer runs the checks;
- an escalation waits for the human, and M6 takes M3's core to do it;
- in M6, not deferred:
  - review of the design and of the tests before implementation;
  - two reviewers for high-risk work, with a tie-break;
  - a stronger model on each attempt.

The decisions below are proposals until the user agrees them.

## Context

See proposal.md for why. M6 builds on M5, which is being implemented now. It reuses:
- M5's per-step sandbox activities: `createSandbox(runId, stage, repo)`, `pollStep` and `deleteSandbox(runId, stage)`, named `factory8-<runId>-<stage>`. `createSandbox` already ignores an existing PVC or pod (409).
- The dumb worker (M1 D1): it manages sandboxes and calls the adapter; agents do all forge work with `gh`.
- The adapter's question flow:
  - `f8-ask` ends a step with `needs_input`;
  - `/answer` resumes the session;
  - the step's state lives on its PVC, so the answer can reach a new pod (`agent-adapter`: "Answer resumes the step", "State survives a pod restart").

Facts that shape the design:
- **The worker can't read GitHub.** It holds no token (M1 D1), and `factory8/factory8` is private, so it can't resolve the plugin's commit. The sandbox can, because it has `GH_TOKEN` (#1).
- **The adapter puts the preamble before the prompt** (`adapter/src/main.ts`), so a slash command wouldn't be the prompt's first token.
- **The workflow can't read env vars** (M1 D8): settings come through activities.
- **LiteLLM serves two models** today (`glm-5.3`, `glm-5.3-flash`).

## Goals / Non-Goals

**Goals:**
- dark-factory's Architect and Ship logic as one Temporal workflow per issue: contract reviews, test-first by a separate agent, graded attempts on a model ladder, diagnosis and routing, two reviewers for high risk, a tie-break;
- prompts that change with a commit to `plugin/`, without a deploy;
- a run whose whole state is visible through a query.

**Non-Goals:**
- changing M5's `sdlcWorkflow` or its prompts;
- child workflows per stage (ORC-7);
- retries of failed steps (M4);
- replay tests (ORC-6);
- deterministic checks run by the platform;
- enforcement of the tests-unchanged rule by a gateway;
- a second vendor.

The proposal's "Not in M6" lists the rest.

## Decisions

### D1. A second workflow type, next to M5's

**Proposed:** `shipWorkflow({ runId, repo, issue })` in `worker/src/ship.ts`, re-exported from `worker/src/workflows.ts` so the worker registers both. Same worker, same task queue (`factory8`), and the run ID is the workflow ID, as before.
- It reuses M5's activities and adds two:
  - `shipConfig()` reads `FACTORY8_BANDS` and `FACTORY8_PLUGIN` once per run (D9);
  - `answerStep(ip, stepId, answer)` POSTs `/answer` (D10).
- `startStep` keeps the request's `profile` when the workflow sets one; M5's role-based choice stays the fallback.
- A local `step(stage, command, profile)` wraps M5's body: create, start, poll, delete in `finally`. It adds the plugin to the request (D4), handles `needs_input` by waiting (D10), and parses the result (D6).
- **Rejected:**
  - replacing M5: the user chose to keep both;
  - child workflows per stage (ORC-7, Phase 1): one function is enough;
  - a separate task queue or worker: nothing needs one.

### D2. What dark-factory becomes on Temporal

| dark-factory | Ship run |
|---|---|
| plan, claims, lanes, overlap | `f8 run --flow ship`; the workflow ID is the claim; one issue, one task |
| architect brief | design step, `.factory8/runs/<runId>/design.md` |
| contract grade of the design / of the acceptance spec | design review / tests review, at most 2 grades each |
| acceptance author (RED on main) | acceptance step (failing on the run branch) |
| implement, attempts ladder in `bands.yaml` | implement, ladder in `FACTORY8_BANDS` |
| CI score before grading | the code reviewer runs the checks first (D11) |
| grade, 2 graders when risk is high | code review, 2 reviewers when risk is high (D8) |
| diagnose A–I, `ROUTE` table, re-architect next tick | diagnose A–I, routed inside the same run (D7) |
| tie-break grader on F | tie-break step on F |
| refs for scores, grades, outcomes, archives | workflow state and the `state` query |
| ADR escalation, blocked task, operator signs | a wait on the `answer` signal (D10) |
| close | finish step: report and PR ready (D12) |
| Land (auto-merge), version tags | not taken: the human merges |
| brief refresh | not needed: a run lasts hours, and `design.md` belongs to it |
| guard hook, L0 paths, signed oracle, signed scores | not in the POC (hardening) |
| reward and usage records | later (playbook §8) |

### D3. The plugin and its skills

**Proposed:**
- **Layout:** `plugin/.claude-plugin/plugin.json` (name `factory8`), and `plugin/skills/<name>/SKILL.md` for `design`, `acceptance`, `implement`, `review`, `diagnose` and `finish`.
- **Frontmatter:** each skill has `name`, `description`, `argument-hint`, and `disable-model-invocation: true`, so a stage's agent can't drift into another stage's skill.
- **One `review` skill with three modes** (`design`, `tests`, `code`). The rubric is shared: severity, evidence, and naming a change that would make each test fail. dark-factory's grade skill works the same way, with task and contract modes.
- **Self-contained skills.** dark-factory's skills require the superpowers plugin. Ours inline the few rules they need: test-first, evidence before claims, debug before changing code. That keeps one plugin to pin.
- **Command format:** `/factory8:<skill> <issue> key=value…` on the first line, plus one JSON object on the next line for findings, notes, an answer or the attempt history. A pure function `command(skill, issue, args, context?)` in `worker/src/results.ts` renders it.
- **Why skills:** prompt wording changes far more often than the loop. A commit to `plugin/` changes the next run's prompts with no deploy, and an engineer can run `/factory8:review 18 …` locally with `claude --plugin-dir plugin`.
- **Rejected:**
  - prompts in worker code (M5 D5): every wording change would need a deploy;
  - skills in each target repo's `.claude/skills`: every project would carry the factory's prompts, and a run could edit its own instructions in its PR;
  - baking skills into the sandbox image: a rebuild for every change;
  - a ConfigMap: not versioned, and can't be pinned per run.

### D4. Pinning the plugin to the run's start time

**Proposed:** each `StepRequest` gets `plugin: { url: FACTORY8_PLUGIN, at: workflowInfo().startTime }`. The adapter checks out the last first-parent commit of the default branch made at or before `at` (`git rev-list -1 --first-parent --before=<at> origin/HEAD`).
- **Why the time:** the worker can't resolve a commit (Context), but the start time is fixed in the workflow's history. Every step of a run therefore sees the same commit, whatever lands meanwhile, and a replay sees the same value.
- `FACTORY8_PLUGIN` is a worker setting: `https://github.com/factory8/factory8`.
- **Rejected:**
  - the first step resolving the commit and returning it: it changes the adapter's exit contract;
  - `f8` resolving it on the laptop: the engineer's credentials would decide, and the CLI would hold logic;
  - no pinning: half a run on old prompts and half on new ones.

### D5. The adapter changes once

**Proposed:**
- **The preamble moves to `--append-system-prompt`**, passed on every run, fresh or resumed. Stdin holds only the task prompt. M5's steps get the same preamble text, now in the system prompt.
- **A `plugin` field in `StepRequest`:**
  - the adapter clones the plugin into `/f8/plugin`, on the PVC, so a resumed step reuses it;
  - it checks out the pinned commit (D4);
  - it adds `--plugin-dir /f8/plugin/plugin`;
  - git authenticates as the run branch does.
- **Spike first (6.1).** It confirms four things:
  - a slash command on stdin works in `-p` mode;
  - `--plugin-dir` works with the `factory8:` namespace;
  - multi-line arguments reach the skill;
  - `--append-system-prompt` works together with `--resume`.

  If stdin doesn't take slash commands, the prompt goes in as the positional argument instead.
- **Spike result (6.1, 2026-10-30, Claude Code 2.1.311 on the laptop, not the sandbox image's version):**
  - `/factory8:x 12 a=1` plus a JSON line on stdin, with `--plugin-dir`, ran the skill, and it saw both lines. No positional fallback is needed.
  - `--append-system-prompt` applies to a fresh session. On `--resume` the flag is ignored and the session keeps the system prompt it started with. A session started without the text doesn't gain it on resume. So the preamble must be on the fresh run; passing it again on resume is harmless. The branch it names doesn't change within a run.
  - With `disable-model-invocation: true`, a prompt about fruit didn't start a skill whose description matched it.
  - Re-check on the sandbox image's version at 6.3.
- **Rejected:** a `skill` field that the adapter renders into a command (AGT-4 translation). There is only one vendor today; the adapter translates when the second one arrives (AGT-2).

### D6. Structured results

**Proposed:** a step's result is the last non-empty line of its `done` summary, as a JSON object. `parseResult(kind, summary)` in `worker/src/results.ts` validates each shape against the `factory8-plugin` spec:
- causes are restricted per stage;
- `SHIP` carries no `blocker` or `critical` finding, and `DO_NOT_SHIP` carries at least one.

The function is pure, so it runs in workflow code. A missing or invalid result ends the run `parked` with cause `H`, as dark-factory treats an empty agent result as infra.
- **Rejected:**
  - M5's `Verdict:` line: it carries no findings or causes for the workflow to route on;
  - CLI-specific structured-output flags: the result line works with any CLI;
  - results in files on the branch: that's git as state, which the user ruled out.

### D7. The loop, its caps and routing

**Proposed:** the constants `CONTRACT_MAX = 2`, `REWORK_MAX = 2`, `DETERMINATE_EXTRA = 1` and `BOUNCES_MAX = 2` live in `ship.ts` (no speculative config, as M5 D4). They become `FACTORY8_BANDS` keys when someone needs to change one.

```
design ⇄ design review            (≤ CONTRACT_MAX grades, then escalated)
acceptance ⇄ tests review         (≤ CONTRACT_MAX grades, then escalated)
implement loop:
  attempt n on ladder[n] → stopped? route(cause)
                         → code review ×1 (×2 if high) → all SHIP? finish(ready)
  after REWORK_MAX failed attempts → diagnose
    D → one more attempt (DETERMINATE_EXTRA), then escalated(attempts_exhausted)
    F → tie-break     A → acceptance     B, G → design     E → wait, then design
    C → too_big       H, I → parked
route back to design/acceptance ≤ BOUNCES_MAX, then escalated(bounces_exhausted)
```

- **This mirrors dark-factory's `runLaneInner`**, except that re-architecting happens inside the same run instead of through outcome records and a later Architect tick.
- **A design bounce also redoes acceptance,** because the tests were written for the old design.
- **A new implement loop starts at the bottom of the ladder:** a bounce changes the task, so the cheap profile gets the first try again.
- **An unknown stop cause routes as `B`** (dark-factory's rule).
- **Stage names count each kind across the run** (`design-2` after a bounce), so every step's pod and PVC name is unique.

### D8. Risk and reviewers

**Proposed:**
- The risk comes from the design result. A design review that returns `risk: high` raises it, and nothing lowers it.
- When the risk is `high`, each code review runs two `step()`s in turn, `code-review-<n>a` then `code-review-<n>b`, both on the review profile.
- **Why in turn (the user, 2026-10-30, after the PR #10 review):** only one question can wait at a time, so two reviewers can't get each other's answers. The cost: a high-risk review takes twice as long, and `b` can read `a`'s findings on the PR before it grades. Both are accepted.
- The tie-break, `tiebreak-<n>`, also uses the review profile.
- Contract reviews always use one reviewer, as in dark-factory.
- **Why the same model for both reviewers:** independence comes from fresh context and separate sandboxes, as with dark-factory's two graders. A second reviewer model would need a fourth LiteLLM model.
- **Rejected:** a different vendor for the second reviewer, which waits for AGT-8.

### D9. Models: `FACTORY8_BANDS`

**Proposed:** a JSON worker setting, like `FACTORY8_IMAGES`:

```json
{ "design": {"model": "glm-5.3", "effort": "high"},
  "acceptance": {"model": "glm-5.3", "effort": "high"},
  "implement": [{"model": "glm-5.3-flash", "effort": "medium"}, {"model": "glm-5.3", "effort": "medium"}, {"model": "glm-5.3", "effort": "high"}],
  "review": {"model": "<third model>", "effort": "high"},
  "diagnose": {"model": "<third model>", "effort": "high"},
  "finish": {"model": "glm-5.3-flash"} }
```

- **Read once per run:** `shipConfig` runs first, and its result sits in the workflow's history. A changed setting affects only later runs, and a replay sees the same value.
- **Validated in `shipConfig`:**
  - every key is present and `implement` isn't empty;
  - ~~the review and diagnose models aren't any design, acceptance or implement model~~: dropped (relaxed 2026-11-04: isolation, not a different model, keeps a review independent; DEP-11). Any stage may use any model.

  A failure ends the run as `bad_bands` before any sandbox starts. Finish may use any model, since it only posts what it's given.
- **Why an env var:** `FACTORY8_IMAGES` set the precedent, and a change is a `deploy/worker.yaml` edit plus an apply.
- **Rejected:**
  - a ConfigMap file: another object and another mount for one value;
  - models chosen per run by `f8`: the laptop can't see the installation's models (M5 D7).
- **On the pilot cluster (2026-11-04):** every stage on `glm-5.3`, finish on `glm-5.3-flash`, and implement climbs effort only (medium → high; the last profile repeats), which works only if LiteLLM passes `--effort` through (Risks).

### D10. Human waits (M3's core)

**Proposed:** `defineSignal<[string]>('answer')` and `defineQuery('state')`.
- **In `step()`, on `needs_input`:**
  1. `deleteSandbox` deletes the pod and keeps the PVC;
  2. `state.question` is set;
  3. the workflow runs `await condition(() => answer !== undefined)`;
  4. `createSandbox` runs again with the same name, so the same PVC, once the old pod has finished terminating;
  5. `answerStep`, then `pollStep` after the question's exit event, which the step's log on the PVC still holds;
  6. the whole sequence repeats if the agent asks again.
- **On diagnosis `E`:** the diagnoser has already posted the question. The workflow waits the same way, with no sandbox, then routes to design with the answer.
- **Visibility:** the agent posts its question on the PR (the forge is the agent's work, M1 D1). `f8 run` prints it from the `state` query, and `f8 answer` sends the signal.
- **Left in M3:**
  - `/answer` on the issue (its comment poller);
  - making M5's run wait;
  - M3's spike (3.1). If the spike hasn't run by then, M6's first answered question (6.9) is its first real test on Kata and NFS.
- **Rejected:** the worker posting the question itself, which breaks M1 D1.

### D11. The code reviewer runs the checks

**Proposed:**
- The code reviewer learns how to run the repo's checks from the repo (`AGENTS.md`, `CLAUDE.md`, README, flake). It runs them first, in its own sandbox, and quotes the literal output (TST-2's Phase 0 form). A failing check is a `blocker`, which needs no judgement.
- **Tests unchanged:** the workflow passes the acceptance commit and the test paths, `tests_sha=` and `tests=`. The reviewer runs `git diff <tests_sha> <sha> -- <tests>`, and any diff is `critical`.
- **Rejected (the user's choice):**
  - an adapter command step that runs the checks without an agent;
  - GitHub Actions read through `gh pr checks`.
- **Cost:** with two reviewers, both run the checks. Accepted.

### D12. Finish and outcomes

**Proposed:**
- **The report:** the workflow renders it from its state with a pure function, `report(state)`, in `results.ts`. It holds the outcome, the steps with their models and results, the causes, and the non-blocking findings as follow-ups.
- **The finish skill** posts the report as it is and runs `gh pr ready` only when the outcome is `ready`.
- **Outcomes:**
  - `ready`: the workflow returns `{ outcome, pr, url }`;
  - `escalated`, `too_big`, `parked`: after finish, `ApplicationFailure.nonRetryable(note, outcome)`, as M5 fails with `changes_requested`;
  - a step that exits `failed`: the run fails at once, without finish (retries are M4's).
- **Why a finish step:** the worker makes no forge calls, and with two reviewers no single reviewer knows the attempt passed, so none can mark the PR ready.
- **Rejected:** giving the worker a GitHub token, which breaks M1 D1 and widens #1.

### D13. The CLI

**Proposed:**
- **`f8 run [--flow ship] <issue>`:** `--flow ship` starts `shipWorkflow({ runId, repo, issue })`. While waiting on the result, it queries `state` every 10 s and prints each new stage, and each new question with the `f8 answer` line. Any other `--flow` value prints the usage.
- **`f8 answer <run> "<text>"`:** queries `state`. With no open question it prints that the run isn't waiting and exits 1; otherwise it signals `answer`.
- **Rejected:** `f8 ship <issue>`, because the user chose the flag.

### D14. Docs and order

**Proposed** (the PRD changes need the user's OK at 6.0, as M5's did):
- **PRD:**
  - a §0 row for ORC-2, ORC-3, ORC-5, TST-2, TST-3, TST-5, MNT-6, DEP-11, AGT-3 and §8;
  - §8's Phase 0 row gains M6, after M5;
  - M3 loses the workflow wait and `f8 answer`.
- **`docs/plans/poc.md`:**
  - an M6 row after M5; M2–M4 after M6;
  - under "Not in the POC": gateway enforcement of TST-3, since the tests-unchanged check is made by an agent.
- **M3's proposal and tasks:** 3.2 is about M5's run, and 3.4 moves here.
- **The rest:** `CLAUDE.md`'s layout gains `plugin/`, then `docs/site/prd.html`, `architecture.html` and the memory file.

## Risks / Trade-offs

- [GLM models may often break the result line, which parks the run] → every skill ends with an exact example line. 6.9 counts the parked runs, and if they're common, a repair resume (an adapter change) or M4's retry takes over.
- [A slash command on stdin, `--plugin-dir` and the namespace are unverified] → spike 6.1 before any code, with the positional argument as the fallback.
- [The ladder needs a third model, and `--effort` may not pass through LiteLLM] → the *user* adds a model, and 6.8 records whether effort reaches the provider.
- [Pinning by commit time: a commit made before the run starts but pushed after it is seen by later steps only] → accepted for the POC (`shortcut:` comment); pin a commit when it bites.
- [About 10–20 steps per run: a pod start and a clone each, and many more tokens than M5] → accepted. 6.9 records the steps, the time and the tokens.
- [The checks' "evidence" comes from an agent] → it quotes literal output, and the human sees the PR. TST-2's platform form comes later.
- [Only prompts stop test edits and merges (#1)] → the reviewer's tests-unchanged check. Under "Not in the POC".
- [Both high-risk reviewers share a model's blind spots] → separate contexts now; AGT-8 later.
- [Two SDLC workflows drift apart] → they share activities. Once M6 has run, the user decides whether M5 stays.
- [Deploying while a run is in flight: no replay tests (ORC-6)] → deploy with no run in flight, as M5 does.
- [A waiting run never times out] → accepted; `temporal workflow terminate` ends it.
- [Archive order: M6 modifies `project-detection` and adds to `f8-cli`, which M1 adds] → archive M1, then M5, then M6.

## Migration Plan

1. The *user* adds a third model to LiteLLM, or accepts an effort-only ladder, and picks `FACTORY8_BANDS`.
2. Build `sandbox-image` (the adapter changes) and `worker-image`, and import both onto the node.
3. In `deploy/worker.yaml`: both tags, plus `FACTORY8_BANDS` and `FACTORY8_PLUGIN`. Apply it while no run is in flight. M5's runs behave as before.

Rollback: the previous tags, and drop the two settings.
