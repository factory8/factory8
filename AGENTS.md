# Factory8

Factory8 is a self-hosted AI-native software factory. Temporal workflows, written in TypeScript on Node LTS, drive agent CLIs inside Kata microVM sandboxes, and every artifact lives in git. Factory8 is developed with Factory8 (dogfooding, PRD G11).

## Read first

- `docs/PRD.md`: the requirements. It's a draft, requirement IDs are stable, and §0 logs every change.
- `docs/briefs/factory8-handoff.md`: the latest session handoff.
- `docs/plans/poc.md`: the POC plan: the exit criterion, the milestone order, and what's not in the POC.
- `openspec/`: our specs and work, tracked with OpenSpec. `openspec/specs/` describes what's built. `openspec/changes/` holds one change per milestone: proposal, delta specs, design, and `tasks.md`, which is the task tracker. Run `openspec list`, or use the `/openspec-*` skills.

## Environment

`nix develop` gives you Node 24 LTS, the Temporal CLI, kubectl, d2 and python3. Node runs the TypeScript directly (type stripping, so erasable syntax only); there is no build step.

- `npm test`: tests (`node --test`).
- `npm run typecheck`: `tsc`, no emit.

## Layout

- `docs/`: the PRD, the POC plan, briefs, and `site/` (HTML summaries and D2 diagrams).
- `openspec/`: specs and changes (see "Read first").
- `adapter/`: `f8-adapter`, the daemon inside each sandbox that runs the agent CLI (`agent-adapter` spec), and `f8-ask`.
- Coming with M1: `worker/` (Temporal) and `cli/` (`f8`), as more npm workspaces.

## When the PRD changes

1. Add a row to the current version's table in §0, citing the requirement IDs. Never renumber an ID or reuse a retired one.
2. Update `docs/site/prd.html` and `docs/site/architecture.html`.
3. Re-render any diagram that changed: `cd docs/site && d2 <name>.d2 <name>.svg`.

`docs/site/PRD.md` is a symlink, so there's nothing to copy. `docs/site/index.html` and `loop`/`governance`/`maintain.d2` summarize the SDLC playbook, not the PRD, so leave them alone.

To serve the site: `python3 -m http.server 8080 --directory docs/site`.

## Rules

- Phase 0: build the smallest thing that works. No speculative config, options or abstractions.
- POC first: don't design security hardening into the POC. List each gap under "Not in the POC" in `docs/plans/poc.md` (#1 is on GitHub).
- Never commit credentials or client data.
- Don't use beads (`bd`): it was removed from this repo on 2026-10-23.
- OpenSpec is how we track our own work, not part of the product. It never changes the PRD on its own.
