# M8: read agent sessions, and answer runs from the phone

## Why

Every step's Claude Code session is kept on the session-log volume (AGT-11, split-session-logs), but the only way to read one today is to copy the `*.jsonl` file off it and open it in a terminal. Reading how an agent reasoned is how we tune the stage skills, fix a workflow and audit a run, so it should take one link, also from a phone.

A run that waits on a question shows the question only to whoever is watching `f8 run`, or who checks with Temporal. Factory8 is meant to run without babysitting, so the rare question should come to the engineer as a push notification, and take the answer from the same place.

## What Changes

- **A checkout per repo: `/f8/<owner>/<repo>` instead of `/f8/work`.**
  - Claude Code files a session under its working directory. Today every step works in `/f8/work`, so every session of every repo lands in one project, "work".
  - With the checkout at `/f8/<owner>/<repo>`, sessions group by repo, as they do on an engineer's machine.
  - By default the name comes from the repo URL. A repo can pin it with `workdir: <owner>/<repo>` in `.factory8/project.yaml`, so a move to another owner or GitLab group keeps its sessions together. This is `project.yaml`'s first key (PRJ-1). factory8/factory8 commits one, with comments, as the example.
  - Owners named `home`, `state` or `plugin` are refused: their checkout would land in the sandbox's own directories.
- **A session viewer: a read-only third-party web UI over every step's session.**
  - [agentsview](https://github.com/kenn-io/agentsview). A spike ran it and [claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer) on real sessions, and picked agentsview (design D1).
  - It reads the session-log volume, `factory8-sessions`, read-only, so a new step's session shows up without anything being copied or uploaded. It runs in `factory8-sandboxes`, the volume's namespace.
  - It shows thinking, tool calls with their results, and subagent transcripts, grouped by repo and labelled by run and stage. It has a phone layout. The cluster's SSO gates it, and Traefik then adds the viewer's own bearer token.
  - It never starts or resumes an agent: agents run only in sandboxes (SBX-1, invariant 4). To take over a session, an engineer copies it into a terminal and runs `claude --resume`, as AGT-11 already says.
- **Collie inbox: a waiting run on the engineer's phone.**
  - A small Node service, `inbox/`. Through Collie's durable-agent SDK it shows each run that waits on a question as a pane in [Collie](https://colliepwa.dev), the phone PWA the user already runs.
  - The pane has a text ask, which Collie pushes as a notification, and a link to the step's session in the viewer.
  - A reply in Collie becomes the run's `answer` signal, as `f8 answer` sends it today. A question answered somewhere else, or a run that ends, closes the ask.
  - `f8 answer` keeps working, and nothing requires Collie (invariant 14).
- **A run takes one answer per question.** Once two channels can answer, a second answer to the same question would sit in the queue and be taken as the answer to the run's *next* question. The ship run drops an `answer` that arrives while no question waits, or after its question already has an answer.
- **Deploy:** two Deployments in `deploy/` (viewer and inbox), each with a Service and a Traefik route. The viewer's route goes through the cluster's SSO, and its token is in `deploy/viewer-token.yaml`, kept out of git; the inbox's token comes from OpenBao. The inbox's image is Nix-built and imported by hand, like the worker's; the viewer runs agentsview's published image, pinned by digest.
- **PRD (approved by the user on 2026-11-05):**
  - new PLT-9 (session viewer) and PLT-10 (phone inbox);
  - §4's "no web UI" non-goal and PLT-5 make room for a third-party read-only viewer;
  - AGT-11 names the viewer;
  - PRJ-1: `.factory8/project.yaml` starts in M8, with one key, `workdir`;
  - §8 gains M8, and §0 gets a row.

Not in M8:
- chatting with, steering or resuming an agent from the viewer or from Collie;
- Codex or pi sessions (the viewer reads them, but no sandbox writes them before Phase 1);
- the adapter's `events.jsonl` in the viewer (that's M2's progress);
- notifications for anything other than a question: stalls (M4) and finished runs;
- the agent's transcript inside Collie (the pane links to the viewer instead);
- Factory8's own SSO and roles (PLT-7, Phase 4): the viewer uses the cluster's SSO, which lets in any of its users, and the inbox takes a token. Both are logged under "Not in the POC".

## Capabilities

### New Capabilities
- `session-viewer`: which sessions the viewer shows, how they're labelled, how fresh they are, how it's reached and gated, and that it never runs an agent.
- `collie-inbox`: how a waiting run reaches Collie, what its pane holds, how a reply becomes the `answer` signal, and when an ask closes.

### Modified Capabilities
- `agent-adapter`: the checkout moves from `/f8/work` to `/f8/<owner>/<repo>`, a name the repo can pin in `.factory8/project.yaml`. This changes "Checkout of the run branch", "AGENTS.md as Claude Code context", "Headless CLI run" and "Protocol preamble". "Filesystem layout", with this checkout, is carried by split-session-logs.
- `ship-workflow`: a new requirement, "A question takes one answer": an `answer` that arrives while no question waits, or after its question already got one, is dropped.

## Impact

- **Code:**
  - `adapter/src/main.ts`: the checkout path comes from `workdir` in the repo's `.factory8/project.yaml`, or else from the request's repo URL, not the `WORK` constant. `adapter/test/adapter.test.ts` checks both and the refused names. The sandbox image is rebuilt and its tag updated in `deploy/worker.yaml`;
  - `.factory8/project.yaml` in this repo: `workdir: factory8/factory8`, with comments;
  - a new workspace, `inbox/` (`src/main.ts` plus tests), which depends on `@temporalio/client` and `@colliepwa/durable-sdk` (experimental, pinned);
  - `worker/src/flow.ts`: the `answer` handler's guard, plus a test;
  - root `package.json` workspaces.
- **Nix:** `flake.nix` gains `inbox-image`, from the same `app` as the worker's image. The viewer needs no Nix build.
- **Deploy:**
  - `deploy/viewer.yaml` has the viewer, a link-farm sidecar, the session-log volume mounted read-only, a Service, and an IngressRoute at `factory8-sessions.libre.pod` behind the cluster's SSO. Its token's Secret and Middleware are in `deploy/viewer-token.yaml`, which `.gitignore` keeps out of git;
  - `deploy/inbox.yaml` has the inbox (with the session-log volume mounted read-only, for each step's session ID), a Service, an IngressRoute at `factory8-inbox.libre.pod` and an ExternalSecret for its token;
  - both run in `factory8-sandboxes`, because a pod mounts only PVCs in its own namespace, and are listed in `deploy/kustomization.yaml`;
  - *user*: the inbox's token goes in OpenBao, the viewer's in `deploy/viewer-token.yaml`, and Collie, which is the user's own deployment outside this repo, attaches the inbox.
- **The CLI and the plugin:** unchanged. The plugin's skills don't name `/f8/work`.
- **Docs:**
  - PRD (above);
  - `docs/site/prd.html`, `architecture.html` and `arch.d2`;
  - `docs/plans/poc.md`: the M8 row, plus the token-only gates under "Not in the POC";
  - `CLAUDE.md`: `inbox/`, the two images, and the checkout's `workdir`.
