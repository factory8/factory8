# Tasks

**How the work is done:**
- **By hand:** 8.0, 8.1, 8.2, and every part marked *user*. If dogfooding has resumed, the rest can go through ship runs.
- ***user*** marks work the user does on the cluster, in OpenBao or in Collie.
- **"After"** names the tasks each one waits on.

## 8. M8: read agent sessions, and answer runs from the phone

- [x] 8.0 Docs (design D7; after none). Done when:
  - (done 2026-11-05) the PRD has PLT-9, PLT-10, the §4, PLT-5, AGT-11, PRJ-1, §8 and §12 edits, and a §0 row, all approved by the user;
  - (done 2026-11-05) `docs/site/prd.html` and `architecture.html` match the PRD, and `arch.d2` shows the viewer and the inbox, re-rendered to `arch.svg`;
  - `docs/plans/poc.md` has the M8 row (after M6). Under "Not in the POC" it lists:
    - the viewer behind the cluster's SSO with no role check, and the inbox gated by a token (PLT-7);
    - transcripts readable by anyone who signs in (#1);
    - commands that anyone who signs in can run in the viewer's pod (agentsview's custom terminal, design D1);
    - the viewer's token in plain text in a Middleware (design D4);
  - `CLAUDE.md` lists `inbox/`, the viewer and inbox images, and the checkout at `/f8/<owner>/<repo>` with `workdir` in `.factory8/project.yaml`;
  - the memory file notes M8.
- [x] 8.1 Viewer spike (by hand; design D1–D3; after none). Run agentsview and `cchv-server` v1.32.2 (`--serve --read-only`) on one farm built by D2's loop. The farm points at a copy of the share's `factory8-sandboxes` that holds at least one finished ship run. In one copied session, rewrite `cwd` to `/f8/factory8/factory8` with `sed` on the copy, to stand in for D8 before the adapter changes. Done when D1 records, for each viewer:
  - whether sessions group by repo, and whether each shows its run and stage;
  - that thinking, tool calls with their results, and subagent sessions render;
  - how long a line appended to a session file on the NFS mount takes to show, measured by appending from another NFS client;
  - whether session pages read at 390 px with no sideways scroll;
  - how the token reaches the server from a phone browser, and the form of a session's deep link;
  - that the copy is unchanged afterwards (`find <copy> -newer <stamp>` prints nothing).

  D1 then names the pick by its rule, and D4 and D5 keep only that viewer's variant.
- [ ] 8.2 Collie spike (*user* + me; design D5; after 8.6, which the user moved ahead of it on 2026-11-22, since the spike's program was most of the inbox). The inbox's image, its `text` asks seeded with `seedAsk` and served through `wireListener` behind the bearer check, at a temporary IngressRoute on `factory8-inbox.libre.pod`. Done when D5 records:
  - whether the user's Collie attaches it with `collie durable attach --url` and trusts the host's certificate, or which fallback we use;
  - that the ask reaches the phone as one push, and the typed reply reaches the sink;
  - that `decideAsk` closes the ask on the phone, and a tap after that shows it as too late;
  - whether a URL in the ask's body is tappable.
- [x] 8.3 One answer per question (design D6; `ship-workflow` delta; after none). Done when:
  - the `answer` handler in `worker/src/flow.ts` queues an answer only while a question waits and none is queued;
  - `worker/test/flow.test.ts` covers two cases:
    - two answers to one question: the step resumes with the first, and the next question waits for a new answer;
    - an answer sent with no question waiting: it is dropped.

  `npm test` and `npm run typecheck` pass.
- [x] 8.4 A checkout per repo (design D8; `agent-adapter` delta; after none). Done when:
  - `workdir(url, projectYaml?)` in the adapter replaces `WORK`. Its tests cover:
    - with no `workdir`: `https://github.com/librepod/marketplace.git` and `https://github.com/factory8/factory8` give `/f8/librepod/marketplace` and `/f8/factory8/factory8`, and a local bare-repo path gives its last two segments;
    - `workdir: acme/shop` overrides the URL, also with comment lines around it, quotes and a trailing comment;
    - refused, with a reason that names the value: the owners `home`, `state` and `plugin`, from the URL (the reason then says to set `workdir`) or from the file; one or three segments; `..`; a leading `.`;
  - `adapter/test/adapter.test.ts` checks that:
    - a repo whose default branch has `.factory8/project.yaml` is checked out at its `workdir`;
    - the preamble names the checkout, and the CLI runs in it;
    - a restarted adapter keeps the checkout from `state/checkout`, without cloning again;
    - a refused name fails the step before the CLI starts;
  - this repo has `.factory8/project.yaml` with `workdir: factory8/factory8`, and comments that say what the key does, when to set it, and which names are refused;
  - `nix build .#sandbox-image` passes.

  `npm test` and `npm run typecheck` pass. The image is deployed with 8.5 (Migration Plan).
- [ ] 8.5 The viewer (*user* + me; design D2–D4; `session-viewer` spec; after 8.1, 8.3, 8.4, split-session-logs 7.1). Done when:
  - the picked viewer's image builds or is pinned;
  - `deploy/viewer.yaml` (in `deploy/kustomization.yaml` since 2026-11-21, behind SSO, showing one step's sessions) gains the `farm` container, and `CLAUDE_PROJECTS_DIR` moves to the farm;
  - *user*: `deploy/viewer-token.yaml` is made and applied (done 2026-11-21), and the manifests are applied. The worker and sandbox images with 8.3 and 8.4 ship with split-session-logs 7.1;
  - at `https://factory8-sessions.libre.pod`, from a phone on the tailnet:
    - a browser that isn't signed in is sent to the SSO sign-in, and a call to the Service without the token gets 401;
    - signed in, a ship run started after the deploy is listed under factory8/factory8, with its run and stage shown (design Risks: the list hid run `pdi0bk`'s sessions);
    - a step started after the deploy appears within a minute;
    - a reload of a running step's session shows its new turns within the time D1 recorded;
  - the viewer's pod has no ServiceAccount token, and no binary named `claude`, `codex` or `pi`.
- [x] 8.6 The inbox (design D5; `collie-inbox` spec; after 8.1, split-session-logs 7.1). Done when:
  - `inbox/` is a workspace with `src/main.ts`, and depends on `@temporalio/client` and `@colliepwa/durable-sdk` at an exact version;
  - `inbox/test/` covers:
    - `waiting()` returns an ask only for runs whose `state` has a question, and skips runs without a `state` or with no question;
    - `askId` is the same for the same run, stage and question, and different for a new question;
    - the link is built from the step's `<runId>-<stage>/state/session` file on the log volume and the picked viewer's deep-link form;
    - the sink signals `answer` and replies `taken` when the run still waits on that question, and replies `too-late` with no signal otherwise;
    - the sink refuses a blank reply, before it queries `state`, and sends no signal;
    - the bearer check answers 401 to a missing or wrong token;
  - `nix build .#inbox-image` passes.

  `npm test` and `npm run typecheck` pass.
- [ ] 8.7 Inbox deploy (*user* + me; design D5, Migration Plan; after 8.5, 8.6). Done when:
  - `deploy/inbox.yaml` is in `deploy/kustomization.yaml`. It holds:
    - a Deployment in `factory8-sandboxes` with `TEMPORAL_ADDRESS`, `FACTORY8_VIEWER_URL`, the token, and the PVC `factory8-sessions` mounted read-only;
    - a Service, an IngressRoute and an ExternalSecret;
  - *user*: the token is in OpenBao, the image is imported, the manifests are applied, and the inbox is attached in Collie as 8.2 recorded;
  - `curl https://factory8-inbox.libre.pod/session/v1/hello` without the token answers 401.
- [ ] 8.8 First answers from the phone (after 8.7). Done when, on factory8/factory8:
  - a ship run whose design step asks a question pushes one notification to the phone within 30 s, while no pod of the run exists;
  - the ask's link opens that step's session in the viewer, with the thinking that led to the question;
  - a reply in Collie resumes the step, and its pane closes;
  - restarting the inbox while a run waits pushes no second notification;
  - a second waiting run answered with `f8 answer` has its Collie ask closed within 30 s, and a tap on it after that is refused as too late;
  - the user merges or closes each PR.

## Workflow follow-up

- When 8.8 holds, archive this change (`/openspec-archive-change`).
