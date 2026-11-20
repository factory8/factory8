# README: document `f8 run --flow` and `f8 answer` (#17)

The README documents only `f8 run <issue>`. Since M6/M7 the CLI also starts any flow with `--flow`, answers a waiting run with `f8 answer`, and refuses to start a run no worker can serve — none of it is in the README, and two lines now say the opposite. Document the three, and clear the contradictions.

## Files that change

**`README.md`** — the only file. One short passage in "Using f8", placed after "**What happens**" and before "**Watching**":

- **Flows.** `f8 run --flow <name> <issue>` starts the workflow `<name>Workflow` on the repo's own queue `factory8/<owner>/<repo>`, served by the repo's worker. `sdlc` is the default and `ship` the other built-in flow; a repo's own flows live in `.factory8/workflows/` (this repo has `gated`: a plan, your go-ahead, then the build). A name starts with a lowercase letter and holds only letters and digits. A name the repo's worker has no workflow for ends the run at once with the worker's message. While `f8` waits it prints each stage as it starts; a run that ends ready prints the PR's URL, any other end prints why and exits 1.
- **Answering a question.** A flow that asks one — `ship` and the project flows — waits without a sandbox, and `f8` prints the question together with `f8 answer <run> "<text>"`. Answer in another terminal (Ctrl-C stops only the wait) and the run carries on. `f8 answer` on a run that isn't waiting prints so and exits 1.
- **No worker, no run.** Before any run, `f8` checks that a worker polls the repo's queue; when none does, it prints `no worker serves factory8/<owner>/<repo>` and exits 1 without starting a run.

Same edit, two contradictions cleared:

- The `needs_input` bullet stays — the default SDLC run still fails on a question — but "You can't answer it in the run yet" becomes a pointer to the passage above: only flows that wait can be answered.
- "**Not there yet**" still lists "answers" among what's missing; drop that word, keep the rest.

No spec, code or site change: the behavior is already specified in the M7 `f8-cli` delta (`openspec/changes/m7-project-workflows/specs/f8-cli/spec.md`), and `docs/site/` summarizes the PRD, not the README.

## Order of work

1. Write the passage in `README.md`, between "**What happens**" and "**Watching**".
2. Clear the two contradictions (`needs_input` bullet, "Not there yet").
3. Read the README end to end and check every new claim against `cli/src/main.ts`, `cli/src/run.ts` and the M7 `f8-cli` delta.
4. In the dev shell, `npm test` and `npm run typecheck` — nothing but `README.md` changed, so both must pass unchanged.

## Risks

- **Saying more than the code does.** The README is the product's front door, so each claim is tied to code: the worker check and the queue the workflow starts on (`cli/src/main.ts:39-52`), the flow-name rule (`cli/src/run.ts:21`), stage and question printing (`cli/src/main.ts:84-85`), the answer signal and its refusal (`cli/src/main.ts:22-31`). Anything not verifiable there stays out.
- **Scope creep.** Only `README.md` changes. The two contradiction fixes are part of making the `f8 answer` documentation true, not new material; nothing else moves, even where the README could say more (e.g. `f8 watch`).
- **The `gated` example goes stale** if that flow is renamed. The issue itself names it, and the fix is a one-word edit.

## Proof

- `git diff master...factory8/t76bfe --stat` shows one file: `README.md`.
- Each documented behavior traced to the code above and to the M7 `f8-cli` delta, which the issue names as the source of truth.
- `npm test` and `npm run typecheck` pass in the dev shell, untouched by a docs-only diff.
- The README read end to end no longer contradicts itself on answers.

Run: t76bfe
Fixes #17
