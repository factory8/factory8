# Factory8

Factory8 is a self-hosted AI-native software factory. Temporal workflows, written in TypeScript on Node LTS, drive agent CLIs inside Kata microVM sandboxes, and every artifact lives in git. Factory8 is developed with Factory8 (dogfooding, PRD G11).

## Read first

- `docs/PRD.md`: the requirements. It's a draft, requirement IDs are stable, and §0 logs every change.
- `docs/briefs/factory8-handoff.md`: the latest session handoff.
- `docs/plans/poc.md`: the POC plan: the exit criterion, the milestone order, and what's not in the POC.
- `openspec/`: our specs and work, tracked with OpenSpec. `openspec/specs/` describes what's built. `openspec/changes/` holds one change per milestone: proposal, delta specs, design, and `tasks.md`, which is the task tracker. Run `openspec list`, or use the `/openspec-*` skills.

## Environment

`nix develop` gives you Node 24 LTS, the Temporal CLI, kubectl, helm, d2, and uv with python3. Node runs the TypeScript directly (type stripping, so erasable syntax only); there is no build step.

- `npm test`: tests (`node --test`), inside the dev shell: the worker's tests start its `temporal`.
- `npm run typecheck`: `tsc`, no emit.
- `nix build .#sandbox-image`: the sandbox image (M1 design D3). The result is a script that streams the image; pipe it to `docker load` or `k3s ctr images import -`.
- `nix build .#worker-image -o result-worker`: the worker's image (M1 design D4), streamed the same way. After importing either image, put its new tag in `deploy/worker.yaml`.
- `nix build .#project-worker-image` (M7): this repo's own project worker image, made by the flake's `lib.workerImage` from `.factory8/workflows/` and the built-in flows, bundled at build and pinned to the commit it's built from (a dirty tree fails). Its tag goes in `deploy/projects/factory8.yaml`.

## Layout

- `docs/`: the PRD, the POC plan, briefs, and `site/` (HTML summaries and D2 diagrams).
- `openspec/`: specs and changes (see "Read first").
- `adapter/`: `f8-adapter`, the daemon inside each sandbox that runs the agent CLI (`agent-adapter` spec), and `f8-ask`.
- `worker/`: the Temporal worker and its workflows: the M1/M5 SDLC run (`run-workflow` spec) and the M6 ship run (`ship-workflow` spec); it manages sandboxes and talks to the adapter, nothing else.
- `plugin/`: the `factory8` Claude Code plugin, one skill per ship stage (`factory8-plugin` spec). Stage prompts change here, not in worker code. From M7 a run loads the plugin at its worker image's commit, so a skill change reaches runs with the next worker image. Try one locally with `claude --plugin-dir plugin`.
- `.factory8/workflows/` (M7): this repo's own flows, TypeScript workflows built into its project worker image.
- `cli/`: `f8`, the engineer's terminal (`f8-cli` spec). `f8 run <issue>` in a clone starts a run and prints the agent's summary; `f8 run --flow ship <issue>` starts a ship run and prints its stages, and `f8 answer <run> "<text>"` answers its question. From M7, `f8 run --flow <name> <issue>` starts any flow, built-in or the project's own, on the repo's task queue `factory8/<owner>/<repo>`. It reaches Temporal at `TEMPORAL_ADDRESS`: through Tailscale, `temporal-frontend.factory8.svc.cluster.local:7233`; otherwise the default `localhost:7233` and `kubectl -n factory8 port-forward svc/temporal-frontend 7233`. From any clone: `nix run <this repo>#f8 -- run 12`.

## When the PRD changes

1. Add a row to the current version's table in §0, citing the requirement IDs. Never renumber an ID or reuse a retired one.
2. Update `docs/site/prd.html` and `docs/site/architecture.html`.
3. Re-render any diagram that changed: `cd docs/site && d2 <name>.d2 <name>.svg`.

`docs/site/PRD.md` is a symlink, so there's nothing to copy. `docs/site/index.html` and `loop`/`governance`/`maintain.d2` summarize the SDLC playbook, not the PRD, so leave them alone.

To serve the site: `uv run python -m http.server 8080 --directory docs/site`.

## Rules

- Phase 0: build the smallest thing that works. No speculative config, options or abstractions.
- POC first: don't design security hardening into the POC. List each gap under "Not in the POC" in `docs/plans/poc.md` (#1 is on GitHub).
- Never commit credentials or client data.
- Never run Python directly (`python`, `python3`, `pip`): use `uv`, as in `uv run python …`, and `uv run --with <pkg> …` for a one-off dependency.
- Don't use beads (`bd`): it was removed from this repo on 2026-10-23.
- OpenSpec is how we track our own work, not part of the product. It never changes the PRD on its own.
