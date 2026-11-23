# deploy/worker.yaml: its header still says the sandbox tag is updated there (#18)

Since #16 (M7 task 7.8), a repo's sandbox image tag lives in the Deployment that serves the repo — this repo's `FACTORY8_IMAGES` in `deploy/projects/factory8.yaml` — and the shared worker's `FACTORY8_IMAGES` is `{}` at 0 replicas. `deploy/worker.yaml:2` still says to update the `.#sandbox-image` tag "here", and the same stale rule ends `AGENTS.md:19` (`CLAUDE.md` is a symlink to it). The fix is two comment lines plus tests that pin them.

**Read this first: the issue is already solved by an open, ready PR.** PR #25 (run `pdi0bk`) implements exactly the change below — same owner-pinned wordings, same tests — and is reviewed ready (design SHIP_WITH_FIXES, tests SHIP, code SHIP). This plan does not improve on it; building this run would duplicate it. The choice — merge #25 and discard this run, or build this and close #25 as superseded — is the owner's, made when deciding whether to build; both PRs must not stay open against #18.

The wordings are the owner's call (the issue's explicit constraint) and that call is settled, not made here: option **B** for `deploy/worker.yaml`, and yes to fixing `AGENTS.md:19` — answered by `f8 answer` (no GitHub trace; PR #25's design review verified it against Temporal history). The build copies them verbatim; any rewording re-opens the owner's call.

## Files that change

**`deploy/worker.yaml`** — line 2 only, the header comment. It becomes exactly (option B, as posted on #18):

```
# Image tags are Nix hashes: after `nix build .#worker-image`, import the image and update its tag here; each repo's sandbox tag (`.#sandbox-image`) goes in the Deployment that serves the repo.
```

**`AGENTS.md`** — line 19's trailing sentence `After importing either image, put its new tag in \`deploy/worker.yaml\`.` only. It becomes exactly (the owner's answer, lead-in and backticks as pinned by #25's design):

```
After importing, the shared worker's tag goes in `deploy/worker.yaml`, and a repo's sandbox tag goes in the Deployment that serves the repo (this repo's: `deploy/projects/factory8.yaml`).
```

**`worker/test/deploy.test.ts`** — new, two tests (same as #25's, already tests-reviewed): each `readFileSync`s its real file and asserts the pinned sentence is present and the stale phrasing (`Both image tags`, `put its new tag in`) is absent — following `worker/test/plugin.test.ts`'s `readFileSync(new URL('../../…'))` idiom, the cheapest guard that makes a regression to the stale wording fail `npm test`.

Nothing else: no manifest field or code path moves, both new sentences agree with `deploy/projects/factory8.yaml`'s existing header and the `.#project-worker-image` bullet, and the old rule in `openspec/changes/archive/`, `docs/briefs/` and `docs/plans/` is history, untouched.

## Order of work

1. Settle the overlap: either merge #25 (then this run ends discarded) or close #25 as superseded — before any edit, so #18 never has two live PRs.
2. Write `worker/test/deploy.test.ts` with the two tests above; run `npm test` and watch both fail on the pinned sentences.
3. Replace `deploy/worker.yaml:2` with option B; the header test passes.
4. Replace `AGENTS.md:19`'s trailing sentence; `npm test` and `npm run typecheck` pass in the dev shell.
5. Commit the three files and push.

## Risks

- **Duplicating a ready PR** — the top risk, and the reason this is a draft: #25 is open, reviewed ready, and identical in substance. Building this run while #25 stays open leaves two PRs fixing #18; step 1 makes that impossible.
- **Wording drift.** The two sentences are the owner's, quoted with provenance above; the build copies them byte for byte. Any deviation — casing, backticks, lead-in — re-opens the call the issue reserves to the owner.
- **Scope creep.** Two comment lines and one test file. History documents that mention the old rule stay as they are; no spec, site or PRD change (this is not a PRD change, so `docs/site/` is out of play).
- **Stale-again risk is low but real** if deploy layout changes again (e.g. a second project repo); the negative pins catch the exact old phrasings, and any new layout would touch `FACTORY8_IMAGES` anyway.

## Proof

- `git diff master...factory8/tswwrp --stat` shows exactly three files: `deploy/worker.yaml` (1 line), `AGENTS.md` (1 line), `worker/test/deploy.test.ts` (new).
- Both new tests red before the line edits, green after; reverting either line fails its test's positive pin, and reintroducing `Both image tags` or `put its new tag in` trips the negative pins.
- `npm test` and `npm run typecheck` pass in the dev shell.
- The two sentences match the owner's recorded call verbatim (option B on #18; the `f8 answer` quoted by #25's design review), `CLAUDE.md` reads fixed through the symlink, and a repo-wide grep finds the stale phrasings only in history and run artifacts.

Run: tswwrp
Fixes #18
