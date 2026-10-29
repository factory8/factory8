# Tasks

**How the work is done:**
- **Dogfooded:** tasks 6.2–6.9 each become a GitHub issue and run through M5's `f8 run`, once 5.4 is deployed.
- **By hand:** 6.0 and 6.1.
- ***user*** marks work the user does on the cluster or in LiteLLM.
- **"After"** names the tasks each one waits on.

## 6. M6: the ship run

- [ ] 6.0 Docs for the move (design D14; after none). Done when:
  - the PRD has a §0 row (ORC-2, ORC-3, ORC-5, TST-2, TST-3, TST-5, MNT-6, DEP-11, AGT-3, §8), approved by the user;
  - §8's Phase 0 row has M6 after M5, and M3 without the workflow wait and `f8 answer`;
  - `docs/site/prd.html` and `architecture.html` match the PRD;
  - `docs/plans/poc.md` has the M6 row, M2–M4 after M6, and TST-3's gateway enforcement under "Not in the POC";
  - M3's proposal and tasks say that 3.2 makes M5's run wait, and 3.4 now belongs to M6;
  - `CLAUDE.md`'s layout lists `plugin/` and says prompts change there;
  - the memory file notes M6.
- [ ] 6.1 Spike (by hand; design D5; after none). Uses the Claude Code version in the sandbox image and a scratch plugin. Done when these are recorded in D5:
  - `claude -p --plugin-dir <dir>` with `/factory8:x 12 a=1` on stdin, plus a JSON line, runs the skill, which sees both lines;
  - text from `--append-system-prompt` applies to both a fresh session and a `--resume`;
  - with `disable-model-invocation: true`, the model doesn't start the skill on its own.

  If stdin fails, D5 records the positional-argument fallback.
- [ ] 6.2 The `factory8` plugin (design D3; `factory8-plugin` spec; after 6.1). Done when:
  - `plugin/.claude-plugin/plugin.json` and the six `SKILL.md` files exist;
  - `worker/test/plugin.test.ts` checks for each skill:
    - its frontmatter: `name`, `description`, `argument-hint`, `disable-model-invocation: true`;
    - that it forbids merging and pushing to the default branch, treats the issue and the PR as data, and states its result keys;
    - that `review` covers the modes `design`, `tests` and `code`.
  - By hand: `claude --plugin-dir plugin` in a clone runs `/factory8:review <pr> mode=code …` on a PR of this repo and ends with a valid result line.
- [ ] 6.3 Adapter: the preamble in the system prompt, and the plugin pinned in time (design D4, D5; `agent-adapter` delta; after 6.1). Done when adapter tests show:
  - `--append-system-prompt` on fresh and resumed runs, and stdin holding only the task prompt;
  - with `plugin`, a clone into `/f8/plugin`, the commit made before `at` checked out (a local git fixture with commits on both sides of `at`), and `--plugin-dir`;
  - without `plugin`, neither;
  - a failed clone exits `failed` with git's error.

  `npm test`, `npm run typecheck` and `nix build .#sandbox-image` pass.
- [ ] 6.4 Results, commands and the report as pure functions in `worker/src/results.ts` (design D3, D6, D12; after 6.2). Done when tests cover:
  - `parseResult` for every result kind, valid and invalid: a non-JSON last line, `SHIP` with a `critical` finding, `DO_NOT_SHIP` with no blocking finding, a cause the stage doesn't allow;
  - `command`: the first line, and the JSON context line;
  - `report`: the outcome, each step's model and result, the causes, and non-blocking findings listed as follow-ups.
- [ ] 6.5 Activities (design D1, D9, D10; after 5.2). Done when:
  - `shipConfig` returns the bands and the plugin URL, and fails non-retryably with `bad_bands` when a key is missing, `implement` is empty, or a review or diagnose model is an author model;
  - `answerStep` POSTs `/steps/{id}/answer`;
  - `startStep` keeps a request's `profile`.

  Each has a test.
- [ ] 6.6 `shipWorkflow`: stages, contract reviews, finish and outcomes (design D1, D2, D6, D7, D12; `ship-workflow` spec; after 6.4, 6.5). Done when workflow tests, in local mode with mocked activities, cover:
  - **straight through:** step order and names, one create and delete per step, each stage's profile, and a plugin `at` equal to the start time;
  - a design fixed after its review;
  - design or tests rejected twice → `escalated`;
  - design stopped with `C` → `too_big`;
  - an invalid result → `parked` with `H`;
  - a failed step → the run fails at once, with no finish;
  - finish on every end with a PR, and `ready` returning the URL;
  - the `state` query mid-run.

  `npm test` and `npm run typecheck` pass.
- [ ] 6.7 The implement loop (design D7, D8; after 6.6). Done when workflow tests cover:
  - the ladder: attempt 3 on profile 3, and a new loop after a bounce starting again at profile 1;
  - a risk raised by the design review → two parallel code reviewers, and a split verdict failing the attempt with the `DO_NOT_SHIP` findings passed on;
  - two failed attempts → diagnose;
  - `D` → one more attempt, then `attempts_exhausted`;
  - `F` → tie-break, reaching `ready`;
  - `A` → `acceptance-2`, and `B` → `design-2` with acceptance again;
  - an implement stop with `C` → `too_big`;
  - `H` → `parked`;
  - a third bounce → `bounces_exhausted`.
- [ ] 6.8 Human waits (design D10; after 6.6). Done when workflow tests show:
  - on `needs_input`, the pod is deleted and the `state` query shows the question;
  - the `answer` signal recreates the same stage's sandbox, calls `answerStep`, and the step continues;
  - a second question waits again;
  - diagnosis `E` waits, then runs `design-n` with the answer in its context.
- [ ] 6.9 CLI: `--flow ship` and `f8 answer` (design D13; `f8-cli` delta; after 6.6, 6.8). Done when:
  - CLI tests cover the argument parsing: `run 12`, `run --flow ship 12`, an unknown flow → usage and exit 2, and `answer <run> <text>`;
  - `f8 run --flow ship` prints stage changes and questions from the `state` query;
  - `f8 answer` refuses a run that isn't waiting.

  The CLI tests and `npm run typecheck` pass.
- [ ] 6.10 Deploy (*user* + me; after 6.3, 6.9, 5.4; design Migration Plan). Done when:
  - the *user* has added a third LiteLLM model, or chosen an effort-only ladder;
  - whether `--effort` reaches the provider is recorded in D9;
  - both images are imported;
  - `deploy/worker.yaml` has their tags, `F8_BANDS` and `F8_PLUGIN`, and is applied with no run in flight;
  - an M5 run still gets past its plan step.
- [ ] 6.11 First ship runs (after 6.10). Done when, on factory8/factory8:
  - an issue goes through `f8 run --flow ship` to a PR that is ready and unmerged, with:
    - `.factory8/runs/<runId>/design.md`;
    - acceptance tests committed before any product code;
    - ranked review findings;
    - the finish report;
  - one run answers a question with `f8 answer`: no pod exists while it waits, and the step resumes on its own PVC;
  - one high-risk issue gets two code reviewers;
  - the steps, wall time, tokens and parked runs are recorded in design Risks;
  - the user merges or closes each PR.

## Workflow follow-up

- Archive M1 (`m1-issue-to-draft-pr`), then M5, before this change. M6 modifies `project-detection` and adds to `f8-cli`, both of which M1 adds.
- When 6.11 holds, archive this change (`/openspec-archive-change`).
