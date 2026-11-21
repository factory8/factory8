# Design — issue 18: deploy/worker.yaml's header still says the sandbox tag is updated there

Run: pdi0bk. The owner answered the wording question (issue #18, [comment](https://github.com/factory8/factory8/issues/18#issuecomment-7065263694)): option **B** for `deploy/worker.yaml`, and yes, fix the matching sentence in `AGENTS.md:19`.

Since #16, each repo's sandbox image tag lives in that repo's project Deployment (`FACTORY8_IMAGES`, e.g. `deploy/projects/factory8.yaml`), and the shared worker's `FACTORY8_IMAGES` is empty. Only the shared worker's own image tag is updated in `deploy/worker.yaml`. Two sentences still say otherwise. This change fixes the sentences; it changes no manifest field and no code.

## Acceptance rows

| Behaviour | Test |
| --- | --- |
| `deploy/worker.yaml`'s header no longer says the `.#sandbox-image` tag is updated there, and says each repo's sandbox tag goes in the Deployment that serves the repo | `worker/test/deploy.test.ts`: "worker.yaml header: each repo's sandbox tag goes in the Deployment that serves it" |
| `AGENTS.md`'s `.#worker-image` bullet says the shared worker's tag goes in `deploy/worker.yaml` and a repo's sandbox tag goes in the Deployment that serves the repo (this repo's: `deploy/projects/factory8.yaml`) | `worker/test/deploy.test.ts`: "AGENTS.md: the worker-image bullet names where each tag goes" |

## Done when

- The new wordings match this design verbatim (they are the owner's choice, not the implementer's):
  - `deploy/worker.yaml:2` becomes exactly:
    `# Image tags are Nix hashes: after \`nix build .#worker-image\`, import the image and update its tag here; each repo's sandbox tag (\`.#sandbox-image\`) goes in the Deployment that serves the repo.`
  - `AGENTS.md:19`'s trailing sentence `After importing either image, put its new tag in \`deploy/worker.yaml\`.` becomes exactly:
    `After importing, the shared worker's tag goes in \`deploy/worker.yaml\`, and a repo's sandbox tag goes in the Deployment that serves the repo (this repo's: \`deploy/projects/factory8.yaml\`).`
- The PR's diff is exactly those two lines plus the new `worker/test/deploy.test.ts`; nothing else in either yaml/md file moves.
- `npm test` passes (including the new tests) and `npm run typecheck` passes.

## Files that change

- `deploy/worker.yaml` — line 2, the header comment only.
- `AGENTS.md` — line 19, the trailing sentence only (`CLAUDE.md` is a symlink to it, so both read fixed).
- `worker/test/deploy.test.ts` — new, the two acceptance tests.

## Risk

`low` — comments and docs plus a test; no data model, migration, auth or public API.

## Decisions and assumptions

- **The wordings are the owner's, pinned verbatim above**: option B as posted in the issue comment, and their answer's sentence for `AGENTS.md` with `After importing,` kept as the lead-in (the bullet still describes importing) and the paths in backticks to match the file's style. Reversible only by the owner.
- **A new `worker/test/deploy.test.ts`** pins both sentences by substring and fails on the stale phrasings (`Both image tags`, `put its new tag in`), following `plugin.test.ts`'s `readFileSync(new URL('../../…'))` idiom — the cheapest guard that makes a regression to the stale wording fail `npm test`. Under `worker/test/` because that is where the repo's tests that read repo files live.
- **Assumption:** `openspec/changes/archive/`, `docs/briefs/` and `docs/plans/` mention the old rule only as history and stay untouched; the issue's scope is the two living documents.

## Steps

1. Write `worker/test/deploy.test.ts` with the two tests from the acceptance rows: each asserts its target sentence is present and the stale phrasing it replaces is absent. Run `npm test` — both new tests fail.
2. Replace `deploy/worker.yaml:2` with option B. Run `npm test` — the header test passes.
3. Replace `AGENTS.md:19`'s trailing sentence. Run `npm test` (all green) and `npm run typecheck`.
4. Commit the three files and push.
