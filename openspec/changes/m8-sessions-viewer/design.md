# Design

**Status:** proposed 2026-11-05. Agreed with the user:
- a third-party viewer over building one, read-only: no chat, resume or fork from it;
- the answer channel is Collie, through its durable-agent SDK; `f8 answer` stays;
- a PRD change in this change (PLT-9, PLT-10, and PRJ-1 for `workdir`), written to `docs/PRD.md` on 2026-11-05 (D7);
- the checkout at `/f8/<owner>/<repo>`, so sessions group by repo. A repo can pin the name with `workdir` in `.factory8/project.yaml`, and the owners `home`, `state` and `plugin` are refused (D8; revised 2026-11-05).

The decisions below are proposals until the user agrees them. D1, D2 and D5 depend on what the spikes (tasks 8.1 and 8.2) find.

## Context

See proposal.md for why. What exists now:
- **Where sessions live.** Each step has its own PVC, `factory8-<runId>-<stage>`, in `factory8-sandboxes`, mounted at `/f8` (M5 D2). The adapter sets `HOME=/f8/home` and runs the CLI in `/f8/work`, so a step's session is at `/f8/home/.claude/projects/-f8-work/<uuid>.jsonl`, with subagents under `<uuid>/subagents/`. The pod is deleted when the step ends or asks a question; the PVC stays (AGT-11).
- **The share.** The `nfs-client` StorageClass uses `pathPattern: ${.PVC.namespace}/${.PVC.name}` and `onDelete: retain`, so every step's PVC is a directory `<export>/factory8-sandboxes/factory8-<runId>-<stage>/`. On the pilot cluster the NFS server is the node itself (`127.0.0.1:/exports/k3s`). Finished runs' PVCs are deleted by hand (ART-10 is Phase 2).
- **Every session has the same cwd, `/f8/work`** (the adapter's `WORK` constant). Claude Code files a session under its encoded cwd (`-f8-work`), and viewers that group by the transcript's `cwd` put every step of every repo in one project, "work". D8 changes this.
- **A ship step's first prompt names its stage and run:** `/factory8:<stage> <issue> run=<runId> …` (`command()` in `worker/src/results.ts`). Viewers title a session by its first prompt.
- **Answers.** The ship run waits on the `answer` signal (one string) and answers the `state` query, whose `question` is set while it waits (M6 D10). `f8 answer` checks `state.question`, then signals. The handler pushes every signal onto a queue, and `ask()` takes the first, so a second answer to one question would answer the next one.
- **The user's Collie** runs in the pilot cluster as its own Deployment (namespace `collie`, with a Tailscale sidecar). It is not part of this repo. Collie attaches durable programs with `collie durable attach <name> --url https://… --token-env <VAR>` (wire v1, `bridge/mux/durable/WIRE.md`). Over a URL the wire must be HTTPS, except to localhost, and Collie polls every 2 s while a phone watches, every 10 s otherwise.
- **Exposure today.** The Temporal UI is served at `temporal.libre.pod` through a Traefik `IngressRoute` (`deploy/web.yaml`). Secrets come from OpenBao through ExternalSecrets (`deploy/eso.yaml`).
- **Images.** `flake.nix` builds `app` (the workspaces plus `node_modules`) once; `worker-image` runs `node worker/src/main.ts` from it. Images are tagged by Nix hash and imported by hand.

## Goals / Non-Goals

**Goals:**
- the only change in the sandbox is where the checkout lives (D8). Both features read what is already on the step's PVC;
- one mount shows every run, with no Kubernetes API access for the viewer;
- each piece can be swapped (another viewer, another phone channel) without touching the others or the workflows;
- the one workflow change is a guard that holds for every answer channel.

**Non-Goals:**
- live push of a running session to the browser (a reload is enough, D3);
- search or analytics beyond what the chosen viewer has;
- a Factory8-built UI of any kind.

## Decisions

### D1. The viewer: agentsview or claude-code-history-viewer, decided by the spike

Both read the same farm (D2), both render thinking, tool calls with results and subagent sessions, both search across sessions, and both read Codex and pi for later. With the checkout per repo (D8), both group sessions by repo from the transcript's `cwd`: a project name is no longer a reason to pick one.

- **[kenn-io/agentsview](https://github.com/kenn-io/agentsview)** (MIT, 6.4k stars, v0.46.1 of 2026-10-23):
  - **For:** the more used and more active project; a published image; a bearer token by default in a container; a SQLite index with full-text search and cost dashboards, which scales as kept runs pile up; a deep link per session (`/sessions/<id>`).
  - **Against:**
    - its live view relies on inotify, and inotify misses writes made by other NFS clients. It falls back to a 2-minute poll for symlinked roots, or a full sync every 15 min, so a running step can look stale (D3);
    - it has no read-only switch: Resume and Fork can launch `claude` on the server. That is safe only because the image holds no `claude` binary and `[terminal] mode = "clipboard"` is set;
    - it sends telemetry by default (`AGENTSVIEW_TELEMETRY_ENABLED=0`, `AGENTSVIEW_DISABLE_UPDATE_CHECK=1`);
    - its phone layout is unverified.
- **[jhlee0409/claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer)** (`cchv-server`, MIT, 2.3k stars, v1.32.2 of 2026-10-20):
  - **For:**
    - it rereads projects on each request, so a reload shows a running step's latest turns;
    - an explicit `--read-only`, and no spawn calls in its server's request handlers (grepped);
    - a phone layout (390 px, bottom tab bar);
    - a deep link per session (`?session=<id>`), and no telemetry found;
  - **Against:** a smaller project; no published image (we build one from its release tarball, D4); no index, so search rescans files.

**Proposed:** the spike (8.1) runs both on the same farm, over the same kept runs. Pick **agentsview** if it passes two checks:
- a running step's new turns show within 2 minutes;
- its session pages read at phone width.

Otherwise pick **cchv**. Run that way, agentsview is effectively read-only, because the pod has no agent CLI (spec "The viewer never runs an agent"). D4 and D5 are written for either; where they differ, the spike's pick decides.

- **Rejected:**
  - **building our own:** the user prefers a third-party tool, and these already render the format;
  - **[siteboon/claudecodeui](https://github.com/siteboon/claudecodeui)** (14k stars): AGPL-3.0, built around chatting through an agent in its own process, with no read-only mode;
  - **[d-kimuson/claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer)**: starts and resumes sessions through the Agent SDK in its own process (opt-in), Claude only, no image;
  - **[matt1398/claude-devtools](https://github.com/matt1398/claude-devtools)**: the deepest Claude rendering (context attribution per turn), but it has no auth and is Claude only. Worth a look again if auditing context use becomes the need;
  - **[vakovalskii/codbash](https://github.com/vakovalskii/codbash)** (the user's example): text-only details cut to 2,000 characters, no thinking, a hard-coded home directory, and a browser terminal that starts local shells;
  - **[daaain/claude-code-log](https://github.com/daaain/claude-code-log)**: static HTML that it writes next to the transcripts (our share is read-only to it), and a loopback-only server;
  - **[slopus/happy](https://github.com/slopus/happy) and Claude Code Remote Control:** relays to a *live* session, which don't read past transcripts. Remote Control also needs a claude.ai login and refuses a custom `ANTHROPIC_BASE_URL` (AGT-10);
  - **OpenTelemetry or Langfuse:** Claude Code's telemetry leaves out thinking and tool blocks, and Langfuse would need a hook in every sandbox and a heavy server.

### D2. Sessions reach the viewer: one read-only mount and a link farm

**Proposed:**
- **The mount.** The viewer's pod mounts the share's `factory8-sandboxes` directory once, read-only, as an inline `nfs` volume at `/sessions`. On the pilot cluster that is server `127.0.0.1`, path `/exports/k3s/factory8-sandboxes`; another installation sets its own.
- **The farm.** A sidecar, `farm`, runs a shell loop every 30 s, sharing an `emptyDir` at `/farm` with the viewer, whose `HOME` is `/farm`:

  ```sh
  for d in /sessions/*/home/.claude/projects/*/; do
    pvc=${d#/sessions/}; pvc=${pvc%%/*}
    ln -sfn "$d" "/farm/.claude/projects/$pvc"
  done
  for l in /farm/.claude/projects/*; do [ -e "$l" ] || rm "$l"; done # a PVC deleted by hand
  ```

  The project-level links are the depth both viewers follow; session files under them are regular files. Each link is named after its PVC, so names never clash.
- **The labels.**
  - The project comes from the transcript's `cwd`, `/f8/<owner>/<repo>` (D8), so every step of a repo lands in that repo's project.
  - The run and the stage come from the session's title, its first prompt: `/factory8:<stage> <issue> run=<runId> …`.
  - M5's SDLC run doesn't name its run in the prompt; its sessions are found by time. The spike confirms both labels in each viewer.
- **Rejected:**
  - **mounting each PVC into the viewer:** every new step would mean a pod restart and Kubernetes API access for the viewer;
  - **sandboxes writing sessions to one shared volume:** breaks a step's isolation (DEP-11) and the "one PVC per step" rule (M5 D2);
  - **a `hostPath` of the export's backing directory:** would only work where the NFS server is the node, and the farm already fixes discovery.

### D3. Freshness: a reload, no live push

**Proposed:** no watcher of ours. inotify doesn't see writes that other NFS clients make (the sandbox pods), so no viewer's live mode can be relied on here.
- cchv rereads on each request, so a reload shows a running step's latest turns.
- agentsview relies on its 2-minute poll or its 15-minute sync. That is the check in D1.
- The farm adds a new step within 30 s.

That covers the stuck-step case in the spec. M2's `f8 watch` stays the live view of progress.
- **Rejected:** polling the share and pushing to the browser: that is building a viewer feature for a nice-to-have.

### D4. The viewer's image and Deployment

**Proposed:**
- **The image.**
  - For cchv: `packages.viewer-image` in `flake.nix`, a `streamLayeredImage` with `cchv-server` from the pinned release tarball (`fetchzip` with its hash; `autoPatchelfHook` if the binary isn't static).
  - For agentsview: its published image, pinned by digest.
  - Either way, the `farm` container is a pinned `busybox` image.
- **`deploy/viewer.yaml`:**
  - a Deployment `factory8-viewer` in `factory8`, with two containers:
    - `viewer`: `cchv-server --serve --read-only --host 0.0.0.0 --port 8080` with `HOME=/farm`; or agentsview with `CLAUDE_PROJECTS_DIR=/farm/.claude/projects`, the telemetry and update-check switches off, and clipboard terminal mode. The token comes from the Secret;
    - `farm`: the loop in D2;
  - the `nfs` volume read-only at `/sessions`, and an `emptyDir` at `/farm`;
  - no ServiceAccount token (`automountServiceAccountToken: false`) and no other Secret;
  - a Service, and an IngressRoute at `factory8-sessions.libre.pod`, modelled on `deploy/web.yaml`;
  - an ExternalSecret `factory8-viewer` from OpenBao key `apps/factory8-viewer` (*user* sets the token).
- **Rejected:** cchv's upstream Dockerfile: it builds from source. Our images are Nix-built and imported by hand (M1 D4), and a release binary needs no build.

### D5. The Collie inbox

**Proposed:** a workspace `inbox/`, with `src/main.ts`, run from `packages.inbox-image` (the same `app` as the worker's image, with the entry `node inbox/src/main.ts`). It is a Temporal client and nothing else: no Kubernetes access, no forge access.
- **Transport.**
  - `@colliepwa/durable-sdk` (pinned, experimental tag) builds the wire's `core`, served by `node:http` through the SDK's `wireListener`.
  - Before the request reaches the core, a check compares `Authorization: Bearer` with `FACTORY8_INBOX_TOKEN` in constant time, and answers 401 if they differ.
  - Traefik terminates TLS at `factory8-inbox.libre.pod`.
  - The core is made with `allowAlways: false`, as the wire asks for a token-only gate.
- **Finding waiting runs.** Every 10 s, the inbox lists open workflows (`ExecutionStatus = "Running"`) and queries `state` on each. A failed query means a run with no `state` (M5's SDLC run), which it skips. `waiting(runs)`, a pure function, returns `{ runId, stage, question, askId }` for each run whose `state.question` is set. *shortcut: one query per open run every 10 s; add a search attribute for waiting runs when there are more than a few dozen open runs.*
- **The ask.**
  - One workspace, `factory8`, and one pane per waiting run, titled by the run ID.
  - The question is seeded as a `text` ask (`seedAsk`) with a 2000-character limit. Its title is `<runId> · <stage>` and its notification line is the question cut to fit.
  - Its body ends with a link to the waiting step's session in the viewer. The base URL is `FACTORY8_VIEWER_URL`.
  - The session ID comes from `factory8-<runId>-<stage>/state/session` on the share, which the inbox mounts read-only, as the viewer does (D2). The adapter writes that file when the session starts.
  - The link's form depends on the viewer: `/sessions/<id>` for agentsview, `?session=<id>` for cchv.
  - `askId` is a hash of run ID, stage and question, so the same question keeps its ask, and its single push, across inbox restarts.
- **The answer.** The ask's sink re-queries `state` and checks two things:
  - if `question` is still that question, it signals `answer` with the text and replies `taken`;
  - otherwise it replies `too-late`, and nothing is sent.
- **Closing.** On each poll, an open ask whose run no longer waits on its question is closed with `decideAsk` (decided by the program), and its pane is closed.
- **Attaching.** *user*, on the Collie Deployment: the token in an env var, then `collie durable attach factory8 --url https://factory8-inbox.libre.pod --token-env FACTORY8_INBOX_TOKEN`. The spike (8.2) checks that Collie trusts the cluster CA for that host. If it doesn't, the fallback is the inbox as a sidecar in Collie's pod on `http://127.0.0.1:<port>`, which the wire allows. That would mean editing the user's Collie Deployment, outside this repo.
- **Rejected:**
  - **the Temporal UI's Signal button:** no code, but no notification, and the user wants the phone;
  - **ntfy:** notifications with buttons only, no free-text reply;
  - **a Telegram bot:** a cloud service, and a second phone app next to Collie;
  - **GitHub `/answer` comments:** they stay M3's forge channel; they need a comment poller and owner checks, and push only on an @mention;
  - **`pane.ask()` with a promise per ask:** the program then holds the answer's fate in memory; the sink checks Temporal at answer time, which is where the truth is;
  - **the session ID in the run's `state`:** it would mean a new field in the adapter's exit event, in the worker and in `RunState`, just for a link; the file is already on the share.

### D6. One answer per question, in the workflow

**Proposed:** in `flow.ts`, which holds the `answer` handler for every flow since M7, the handler pushes only while a question waits and none is queued: `if (st.question !== undefined && answers.length === 0) answers.push(a)`. Signals delivered in one workflow task run their handlers before `ask()` resumes, so a double answer finds one already queued and is dropped. This is the backstop for the race that the inbox's and `f8 answer`'s checks leave open: two channels check, then both signal. The handler adds no commands, so a replay of a run in flight stays deterministic.
- **Rejected:** a Temporal Update with a validator, which would refuse the second answer to its sender. That is better feedback, but it means a new API for `f8`, the inbox and the tests, and a dropped duplicate is harmless.

### D7. The PRD (approved by the user, written on 2026-11-05)

**Proposed wording:**
- **PLT-9 [0] S, session viewer:** "A read-only web viewer lists every step's agent session kept on the run's volume (AGT-11), labelled by run and stage, and shows its prompts, messages, thinking, tool calls with results and subagents, usable from a phone. It is a third-party tool that reads the volumes in place; it never starts, resumes or messages an agent, and holds no credentials."
- **PLT-10 [0] S, phone inbox:** "A run waiting on a human (ORC-5, SBX-11) reaches the engineer's phone app (Collie) with its question and a link to its session; a reply there is the run's answer signal. It is a convenience: `f8 answer` and the forge stay sufficient (invariant 14)."
- **The edits that go with them:**
  - §4's non-goal becomes "A Factory8-built web UI until a need is proven …; reading agent sessions is met by a third-party read-only viewer (PLT-9)";
  - PLT-5's last sentence becomes "Beyond the read-only session viewer (PLT-9), a web UI is out of scope until needed (§4)";
  - AGT-11 gains "and are readable in the session viewer (PLT-9)";
  - PRJ-1's "(from Phase 1; its schema is written when a feature first reads it)" becomes "(its first key, `workdir`, from M8; the rest from Phase 1, each written when a feature first reads it)" (D8);
  - §8's Phase 0 row gains M8;
  - §12's transcript risk row gains "the viewer and the inbox are token-gated, read-only, and reachable only on the cluster's network and the tailnet";
  - a §0 row in v0.6.

### D8. A checkout per repo: `/f8/<owner>/<repo>`, which a repo can pin

**Proposed:**
- **The default** is the repo URL's last two path segments, without a trailing `.git`: `https://github.com/librepod/marketplace.git` gives `/f8/librepod/marketplace`. The same rule turns the bare repo in the adapter's tests into a path under the test's temporary root.
- **A repo can pin it** with `workdir: <owner>/<repo>` in `.factory8/project.yaml`.
  - A repo's URL can change: a transfer to another GitHub owner, a move to another GitLab group or subgroup. With the derived name, its sessions after the move would land in a new project in the viewer, apart from the earlier ones. A pinned name keeps them together.
  - This is `project.yaml`'s first key. PRJ-1 reserves the file for what the repo's own files can't express, and D7 brings it forward from Phase 1 with this one key.
  - factory8/factory8 commits one, as the example other repos copy. Its comments say what the key does, when to set it and which names are refused. Its value is the default, so nothing moves.
- **Read from the default branch,** before the switch to the run branch, as PRJ-1 says a project's definition is. A run branch can't move its own checkout.
- **Order:**
  1. The adapter clones into `/f8/.clone` and reads `.factory8/project.yaml` there.
  2. It works out the name, then renames the clone to `/f8/<owner>/<repo>`: one call, on the same volume.
  3. It writes the path to `state/checkout`. After a pod restart it reads the path back and skips the clone, so `--resume` runs in the cwd the session started in.

  A `/f8/.clone` left by a restart mid-clone is removed and cloned again.
- **Checks,** on a pinned and a derived name alike:
  - two segments, each starting with a letter, a digit or `_`, then letters, digits, `.`, `_` or `-`;
  - the owner isn't `home`, `state` or `plugin`, the adapter's own directories under `/f8`.

  Anything else fails the step before the CLI starts, with a reason that names the value; for a derived name, the reason says to set `workdir`. No name starts with `.`, so none clashes with `/f8/.clone`. A repo whose name starts with a dot, such as `<owner>/.github`, has to pin a `workdir`.
- **Reading the file:** the sandbox image carries the adapter's source without `node_modules`, and Node has no YAML parser. The adapter reads the one top-level `workdir:` line, with optional quotes and a trailing comment, and the checks above catch anything odd in its value. *shortcut: reads only a top-level `workdir:` line; use a YAML parser, and ship the adapter's dependencies in the image, when `project.yaml` gets a second key.*
- **One function:** a pure `workdir(url, projectYaml?)`, with tests, returns the path or throws the reason, and replaces the `WORK` constant. `checkout()` already names the adapter's git step. Everything that used `WORK` takes the step's checkout: git, the commit hook, the generated `CLAUDE.md`, the preamble and the CLI's cwd.
- Claude Code then files the step's session under `/f8/home/.claude/projects/-f8-<owner>-<repo>/`, as it would on an engineer's machine for a clone at that path.
- **Rejected:**
  - the path in the step request, set by `f8 run` from the engineer's clone: that working copy can be on any branch, and a run started any other way would miss it;
  - a file of its own, such as `.factory8/checkout`: PRJ-1 already names `project.yaml` as the place for this;
  - `/f8/<runId>-<stage>`: a project per step, which scatters a repo's sessions across hundreds of projects;
  - `/f8/<repo>`: repos of the same name from two owners would share a project.

## Risks / Trade-offs

- **Transcripts can hold secrets.** A tool result may print an environment variable, for example `GH_TOKEN` (#1). Anyone who holds the viewer's token reads them. → The viewer is token-gated and reachable on the cluster's network and the tailnet only. The gap goes under "Not in the POC" (SSO, PLT-7), and #1 removes the secrets from sandboxes.
- **Both third-party pieces are small projects, and Collie's wire is experimental.** → Pin both: the viewer by its release hash or image digest, the SDK at an exact version. Each piece only reads the share or talks to Temporal, so replacing one touches no workflow. `f8 answer` always works.
- **Labels rest on viewer behaviour we haven't run:** the project from `cwd`, and the title from the first prompt. → Spike 8.1 checks both in each viewer before anything is deployed.
- **`project.yaml` is read with a one-line match, not a YAML parser.** A `workdir` written in another YAML form, such as a flow mapping or a quoted key, isn't seen, and the path falls back to the URL. → Our example shows the one form, and the shortcut in D8 names the upgrade.
- **A step waiting on a question across the adapter change** would resume in a fresh checkout at the new path. The old session is filed under `-f8-work`, so `--resume` fails and the adapter falls back to a fresh session with the handoff note. Any uncommitted work in `/f8/work` is left behind. → Deploy the new sandbox image when no run waits on a question (Migration Plan).
- **Collie may not trust the cluster CA.** → Spike 8.2. The fallback is the localhost sidecar in D5.
- **A late tap between the inbox's check and its signal.** → The workflow guard (D6) drops it. The cost is that the second answer's sender sees "taken" while the run ignored it. That's rare, and the pane closes on the next poll.
- **An open-run scan every 10 s.** → Fine at POC scale; the shortcut in D5 names the upgrade.
- **The share holds every kept run.** → The viewer lists all of them, until PVCs are deleted by hand (ART-10, Phase 2).

## Migration Plan

1. The workflow guard (D6) ships with the next worker image. A run in flight replays deterministically, because the handler issues no commands.
   - Ship the adapter change (D8) at the same time: rebuild the sandbox image, and put its tag in `deploy/worker.yaml`. Do it when no run waits on a question (`f8` shows none).
   - Runs kept from before stay under `-f8-work`, and the viewer shows them as one "work" project.
2. *user*: put the two tokens in OpenBao, then `kubectl apply -k deploy/` with `viewer.yaml` and `inbox.yaml` after importing both images.
3. *user*: attach the inbox in Collie (D5).

Rollback: delete the two Deployments and detach the inbox in Collie. Nothing else depends on them.

## Open Questions

- Codex and pi sessions: when a sandbox first runs Codex (AGT-2, Phase 1), the farm also links `/sessions/*/home/.codex/sessions` and the viewer gets `CODEX_HOME`. This is deferred because no sandbox writes them yet.
