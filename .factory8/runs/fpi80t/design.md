# Design — f8 answer accepts a blank answer (#19)

`f8 answer <run> ""` (or spaces only) sends an empty answer, which the waiting step takes as the human's reply; a gated run then ends `rejected` with an empty message. The worker's `answer` signal accepts any string (`worker/src/flow.ts:37`), so the CLI is where the blank check belongs: `parseArgs` returns `undefined`, `main.ts` prints the usage and exits 2 — exactly how every other malformed invocation behaves. `parseArgs` runs before the Temporal connection (`cli/src/main.ts:10`), so a blank answer is rejected before anything is signalled.

## Acceptance rows

| Behaviour | Test |
| --- | --- |
| An empty answer text (`f8 answer <run> ""`) is no command: `parseArgs` returns `undefined`, so the CLI prints the usage, exits 2, and signals nothing | `a blank answer is no answer` (new, `cli/test/run.test.ts`) |
| Spaces-only text is blank too, as one arg or several (`" "`, `" " " "`, a tab) | `a blank answer is no answer` |
| A non-blank answer parses exactly as before, spaces kept (` use PostgreSQL ` → text ` use PostgreSQL `) | `a blank answer is no answer` |
| Every other invocation is unchanged: run/flow/answer parsing, malformed flow names, missing answer text | `the arguments: run, run --flow <name>, a malformed flow name, and answer` (existing, untouched) |

## Done when

- Every acceptance row passes.
- `npm test` and `npm run typecheck` pass.

## Files that change

- `cli/src/run.ts` — the `answer` branch of `parseArgs`: join the text args, return the command only if the text is non-blank after trimming.
- `cli/test/run.test.ts` — the new `a blank answer is no answer` test.

## Risk

`low` — argument validation in the CLI; valid input behaves identically, and no auth, data model, migration or public API changes.

## Decisions and assumptions

- **Validate in `parseArgs`, not `main.ts` or the worker** — the issue names it; it is the one place all argument validation already lives, it is unit-tested, and it runs before the Temporal connection. The worker's signal stays unvalidated (a direct Temporal client could still send an empty string): one more hardening layer is not in the POC.
- **The stored text keeps its spaces; only the blank check trims** — smallest change, and leading/trailing spaces in a real answer are harmless. Trimming what the run receives would be a behaviour change the issue doesn't ask for.
- **A dedicated test rather than extending the existing `bad` list** — gives the acceptance rows one named test for the blank cases and leaves the existing parsing test untouched as a regression check.
- Assumed the usage text needs no change: it already shows `f8 answer <run> "<text>"`.

## Steps

1. Add the `a blank answer is no answer` test to `cli/test/run.test.ts` with the cases from the acceptance rows; run `npm test --workspace @factory8/cli` and watch it fail.
2. Change the `answer` branch of `parseArgs` in `cli/src/run.ts` to return `undefined` when the joined text is blank after trimming; the test passes.
3. Run `npm test` and `npm run typecheck`.
