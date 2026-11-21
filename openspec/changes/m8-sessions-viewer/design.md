# Design

**Status:** proposed 2026-11-05. Agreed with the user:
- a third-party viewer over building one, read-only: no chat, resume or fork from it;
- the answer channel is Collie, through its durable-agent SDK; `f8 answer` stays;
- a PRD change in this change (PLT-9, PLT-10, and PRJ-1 for `workdir`), written to `docs/PRD.md` on 2026-11-05 (D7);
- the checkout at `/f8/<owner>/<repo>`, so sessions group by repo. A repo can pin the name with `workdir` in `.factory8/project.yaml`, and the owners `home`, `state` and `plugin` are refused (D8; revised 2026-11-05).

The decisions below are proposals until the user agrees them. The viewer spike (8.1, 2026-11-20) picked agentsview (D1) and changed D2 and D3. D5 still depends on the Collie spike (8.2).

**Revised 2026-11-21 for split-session-logs:** sessions are now kept on one session-log volume, not on each step's PVC, so the viewer (D2, D4) and the inbox (D5) mount that volume instead of the NFS export, and run in its namespace. The spike (D1) ran on the old layout; nothing it measured depends on where the files come from.

## Context

See proposal.md for why. What exists now:
- **Where sessions live** (split-session-logs). Each step writes its logs to its own folder, `<runId>-<stage>`, of one ReadWriteMany PVC, `factory8-sessions`, in `factory8-sandboxes`, mounted at `/f8-logs`. Claude Code's session is at `<runId>-<stage>/projects/<encoded-cwd>/<uuid>.jsonl`, with subagents under `<uuid>/subagents/`, and the adapter's state, `session` included, under `<runId>-<stage>/state/`. The step's own PVC, mounted at `/f8`, is deleted when the step ends.
- **Before that,** sessions stayed on each step's PVC, which the share kept as `<export>/factory8-sandboxes/factory8-<runId>-<stage>/`, and this design first read them through an `nfs` volume of the export. The spike (D1) ran on that layout. On the pilot cluster the log volume is on the same NFS provisioner, but readers depend only on the PVC's name and its folder tree.
- **Every session has the same cwd, `/f8/work`** (the adapter's `WORK` constant). Claude Code files a session under its encoded cwd (`-f8-work`), and viewers that group by the transcript's `cwd` put every step of every repo in one project, "work". D8 changes this.
- **A ship step's first prompt names its stage and run:** `/factory8:<stage> <issue> run=<runId> …` (`command()` in `worker/src/results.ts`). agentsview titles a session by its first prompt (D1).
- **Answers.** The ship run waits on the `answer` signal (one string) and answers the `state` query, whose `question` is set while it waits (M6 D10). `f8 answer` checks `state.question`, then signals. The handler pushes every signal onto a queue, and `ask()` takes the first, so a second answer to one question would answer the next one.
- **The user's Collie** runs in the pilot cluster as its own Deployment (namespace `collie`, with a Tailscale sidecar). It is not part of this repo. Collie attaches durable programs with `collie durable attach <name> --url https://… --token-env <VAR>` (wire v1, `bridge/mux/durable/WIRE.md`). Over a URL the wire must be HTTPS, except to localhost, and Collie polls every 2 s while a phone watches, every 10 s otherwise.
- **Exposure today.** The Temporal UI is served at `temporal.libre.pod` through a Traefik `IngressRoute` (`deploy/web.yaml`). Secrets come from OpenBao through ExternalSecrets (`deploy/eso.yaml`).
- **Images.** `flake.nix` builds `app` (the workspaces plus `node_modules`) once; `worker-image` runs `node worker/src/main.ts` from it. Images are tagged by Nix hash and imported by hand.

## Goals / Non-Goals

**Goals:**
- the only change in the sandbox is where the checkout lives (D8). Both features read what is already on the session-log volume;
- one mount shows every run, with no Kubernetes API access for the viewer;
- each piece can be swapped (another viewer, another phone channel) without touching the others or the workflows;
- the one workflow change is a guard that holds for every answer channel.

**Non-Goals:**
- live push of a running session to the browser (a reload is enough, D3);
- search or analytics beyond what the chosen viewer has;
- a Factory8-built UI of any kind.

## Decisions

### D1. The viewer: agentsview, picked by the spike

Both candidates read the same farm (D2), render thinking, tool calls with results and subagent sessions, search across sessions, and read Codex and pi for later.
- **[kenn-io/agentsview](https://github.com/kenn-io/agentsview)** (MIT, 6.4k stars, v0.46.1 of 2026-10-23): the more used and more active project; a published image; a bearer token by default in a container; a SQLite index with full-text search and cost dashboards, which scales as kept runs pile up.
- **[jhlee0409/claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer)** (`cchv-server`, MIT, 2.3k stars, v1.32.2 of 2026-10-20): it rereads projects on each request, has an explicit `--read-only` and a phone layout with a bottom tab bar; no published image and no index.

**The rule, set before the spike:** pick agentsview if a running step's new turns show within 2 minutes and its session pages read at phone width; otherwise pick cchv.

**The spike (8.1, 2026-11-20).** Both ran in one pod on the pilot cluster, over one farm built from a copy of the share's `factory8-sandboxes`: 14 kept steps, among them every step of the finished ship run `fpi80t`. In one copied session, `cwd` was rewritten to `/f8/factory8/factory8` with `sed`, to stand in for D8. Lines were appended from two other NFS clients: a Kata pod, and a pod with its own NFS mount (`nosharecache`).
- **Grouping and labels:**
  - agentsview names a project by the last segment of `cwd`, and merges PVCs under it: the rewritten session is under `factory8`, the others under `work`. It drops the owner, so `a/shop` and `b/shop` would share a project. A session's title is its first prompt, `/factory8:design 19 run=fpi80t`. At 390 px the list cuts it after the stage (`/factory8:review 19 run=f…`); the session page shows it whole.
  - cchv makes a project of each farm link, so one per PVC: two named `factory8` and nine named `work`, all under "Unavailable locations", since the `cwd` doesn't exist in its pod. Nothing merges them by repo. A session's title is its summary or its last reply. The first prompt is a collapsed `/factory8:design` block, and `run=fpi80t` shows only when it's expanded.
- **Rendering:** both show thinking (collapsed until opened), each tool call with its input and result, and the subagent's session: agentsview inline ("Subagent session · 3 messages", with a link), cchv as a "SubAgent Sessions" link at the top.
- **Freshness,** for a line appended from another NFS client:
  - cchv shows it on the next request, under 2 s, and lists a new step within the farm's 30-s pass (24 s).
  - agentsview on its own showed neither within 20 minutes. inotify misses the remote writes, its 2-minute poll doesn't cover the farm, and its 15-minute reconcile ran with `targets=0`.
  - An open agentsview session page checks its file every 1.5 s and syncs it about 5 s after a change: 11 s in the spike, with the turns it had missed. A page opened after a write shows the old turns until the file changes again.
  - `POST /api/v1/sync`, its ↻ button, catches everything up in 0.3 s. With the farm calling it after each pass (D2), an appended line showed in 4 s and a new step in 5 s.
- **Phone, 390 px:**
  - agentsview: no sideways scroll. The header is crowded and its search box overlaps it, but sessions read.
  - cchv: the session page lays out 459 px wide, because its toolbar (Content | Tool ID) doesn't wrap. Chrome shrinks the page to fit and clips the settings button; Safari would scroll it sideways. Its project explorer fits.
- **Token and link:**
  - agentsview: the page shell loads without the token; every API call needs it (401). On the first visit a form asks for it once, and the browser keeps it in local storage; a URL can't carry it. A session's link is `/sessions/<id>`, and it still opens after the token form.
  - cchv: `/?token=<token>` once sets a cookie; its sign-in page also takes the token. A session's link is `/?session=<id>`.
- **Read-only:** `find <copy> -newer <stamp>` printed nothing after:
  - every agentsview action on a session or its data: star, rename, labels, pin, parent, resume, open, publish, sync, delete, restore, permanent delete, empty trash, strip images, compact, secrets scan and resync;
  - cchv's 25 changing routes, which `--read-only` refuses with 403;
  - a walk of both UIs' pages.

  agentsview keeps such changes in its own database: a session deleted there stays hidden after a resync, though its file is untouched. Its import, push, embeddings, insights and settings routes weren't called; the read-only mount covers the share either way.
- **No agent CLI** in either pod. agentsview's Resume answers with `claude --resume <id> …` to copy, and reports that it found no terminal.

**Picked: agentsview.** It passes both checks. A running step's new turns show in 11 s on its open session page, and within one farm pass anywhere (D2, D3). Its session pages read at 390 px. cchv's session page doesn't fit 390 px, and cchv also misses the spec's grouping by repo and its label.

What comes with agentsview:
- **It has no read-only switch.** A token holder can change its database and its settings. One setting is a custom terminal command (`POST /api/v1/config/terminal`), which Resume then runs in the pod. So whoever holds the token can run commands in the viewer's pod. The share is read-only there and the pod has no ServiceAccount token, but the cluster network, Temporal included, is in reach (Risks).
- **Telemetry and the update check are on by default.** D4 turns both off. The spike's log shows no outbound call, but no packet capture was taken.

- **Rejected:**
  - **cchv:** for the spike's findings above. Its release binary is also the desktop build, linked to WebKitGTK and GTK even for `--serve`: a 648 MB image. What it had over agentsview, a reread on each request, the farm's sync call gives agentsview (D3);
  - **building our own:** the user prefers a third-party tool, and these already render the format;
  - **[siteboon/claudecodeui](https://github.com/siteboon/claudecodeui)** (14k stars): AGPL-3.0, built around chatting through an agent in its own process, with no read-only mode;
  - **[d-kimuson/claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer)**: starts and resumes sessions through the Agent SDK in its own process (opt-in), Claude only, no image;
  - **[matt1398/claude-devtools](https://github.com/matt1398/claude-devtools)**: the deepest Claude rendering (context attribution per turn), but it has no auth and is Claude only. Worth a look again if auditing context use becomes the need;
  - **[vakovalskii/codbash](https://github.com/vakovalskii/codbash)** (the user's example): text-only details cut to 2,000 characters, no thinking, a hard-coded home directory, and a browser terminal that starts local shells;
  - **[daaain/claude-code-log](https://github.com/daaain/claude-code-log)**: static HTML that it writes next to the transcripts (our volume is read-only to it), and a loopback-only server;
  - **[slopus/happy](https://github.com/slopus/happy) and Claude Code Remote Control:** relays to a *live* session, which don't read past transcripts. Remote Control also needs a claude.ai login and refuses a custom `ANTHROPIC_BASE_URL` (AGT-10);
  - **OpenTelemetry or [Langfuse](https://github.com/langfuse/langfuse)** (researched on 2026-11-20, not spiked):
    - Claude Code's own telemetry never sends thinking.
    - Langfuse reads no files. Sessions would reach it through its Claude Code plugin, which is a hook in every sandbox holding Langfuse's keys, or through a reader of the log volume that we would write.
    - Its server is a web app, a worker, Postgres, ClickHouse (through an operator in its chart), Valkey and S3.
    - Its UI has its own logins, not a token.
    - **Kept for later:** when we track cost and token spend across runs, Langfuse is the first candidate. A reader of the transcripts would bring the thinking along.

### D2. Sessions reach the viewer: one read-only mount and a link farm

**Proposed** (revised 2026-11-21 for split-session-logs):
- **The mount.** The viewer's pod mounts the session-log volume, the PVC `factory8-sessions`, read-only at `/sessions`. The pod runs in `factory8-sandboxes`, because a pod mounts only PVCs in its own namespace. Nothing in it names NFS, so another installation needs no change.
- **The farm.** A sidecar, `farm`, shares an `emptyDir` at `/farm` with the viewer, whose projects directory is `/farm/.claude/projects`. Every 30 s it links each step's project directory, removes links to deleted step folders, and asks the viewer to sync (D3):

  ```sh
  mkdir -p /farm/.claude/projects
  while :; do
    for d in /sessions/*/projects/*/; do
      [ -d "$d" ] || continue
      step=${d#/sessions/}; step=${step%%/*}
      [ -L "/farm/.claude/projects/$step" ] || ln -s "$d" "/farm/.claude/projects/$step"
    done
    for l in /farm/.claude/projects/*; do [ -e "$l" ] || rm -f "$l"; done # a step folder deleted by hand
    wget -q -O /dev/null --header "Authorization: Bearer $TOKEN" --post-data '' http://127.0.0.1:8080/api/v1/sync || true
    sleep 30
  done
  ```

  - Each link is named after its step's folder, `<runId>-<stage>`, so names never clash. agentsview follows a linked directory, and the session files under it are regular files. Links to the session files themselves don't work: both viewers skip a linked file (spike 8.1).
  - The volume stays outside `/farm/.claude/projects`. agentsview's watcher walks every real directory under that path; with only links there, it watches one directory.
  - The sync skips unchanged files: 0.3 s over 14 sessions. *shortcut: each sync stats every kept session file over NFS; call it less often when kept runs reach the thousands.*
- **The labels.**
  - The project comes from the transcript's `cwd`. agentsview names it by the last segment, the `<repo>` of `/f8/<owner>/<repo>` (D8), so every step of a repo lands in that repo's project (D1).
  - The run and the stage come from the session's title, its first prompt: `/factory8:<stage> <issue> run=<runId> …`.
  - M5's SDLC run doesn't name its run in the prompt; its sessions are found by time.
- **Rejected:**
  - **mounting each PVC into the viewer:** every new step would mean a pod restart and Kubernetes API access for the viewer;
  - **an inline `nfs` volume of the share's `factory8-sandboxes` directory** (this design's first version, which the spike used): works only where every PVC is a folder of one NFS export. split-session-logs replaced it with the log volume, which each step mounts by subPath, so a step still sees only its own folder (DEP-11);
  - **a `hostPath` of the export's backing directory:** would only work where the NFS server is the node, and the farm already fixes discovery;
  - **the volume mounted inside the projects directory** (at `.share`, with relative links): cchv needed it, because it refuses any path that resolves outside `~/.claude/projects`. agentsview would then watch the whole volume.

### D3. Freshness: the farm asks for a sync, no live push

**Proposed:** no watcher of ours. inotify doesn't see writes that other NFS clients make (the sandbox pods), and agentsview's own fallbacks don't reach the farm (D1). Instead:
- the farm calls agentsview's sync after each 30-s pass (D2), so a new step, or a running step's new turns, show within about 30 s. The spike measured 4 s and 5 s;
- an open session page also syncs its own file about 5 s after it changes (11 s in the spike), so a running step's page updates without a reload;
- the ↻ button syncs at once.

That covers the stuck-step case in the spec. M2's `f8 watch` stays the live view of progress.
- **Rejected:**
  - **polling the volume and pushing to the browser:** that is building a viewer feature for a nice-to-have;
  - **the ↻ button alone:** a new step would stay hidden until someone presses it, and the spec asks for a minute.

### D4. The viewer's image and Deployment

**Proposed:**
- **The images:** agentsview's published image, pinned by digest (`ghcr.io/kenn-io/agentsview:0.46.1@sha256:f43a5fe63c83dc4062f47b731d13f5ecc66131763112b651f3c78de7edc2c395`), and a pinned `busybox` for the `farm` container.
- **`deploy/viewer.yaml`:**
  - a Deployment `factory8-viewer` in `factory8-sandboxes` (D2), with two containers:
    - `viewer`: agentsview on port 8080, with `CLAUDE_PROJECTS_DIR=/farm/.claude/projects`, `AGENTSVIEW_TELEMETRY_ENABLED=0`, `AGENTSVIEW_DISABLE_UPDATE_CHECK=1`, and `AGENTSVIEW_AUTH_TOKEN` from the Secret. Its database is in an `emptyDir` at `/data`, rebuilt from the log volume when it starts (0.4 s for 14 sessions);
    - `farm`: the loop in D2, with the same token as `TOKEN`;
  - the PVC `factory8-sessions` read-only at `/sessions` in both containers, and an `emptyDir` at `/farm`, read-only in `viewer`;
  - no ServiceAccount token (`automountServiceAccountToken: false`) and no other Secret;
  - a Service, and an IngressRoute at `factory8-sessions.libre.pod`, modelled on `deploy/web.yaml`;
  - an ExternalSecret `factory8-viewer` from OpenBao key `apps/factory8-viewer` (*user* sets the token).
- Resume's terminal mode stays at its default, `auto`. The image has no terminal, so Resume only answers with the command (D1).
- **Rejected:**
  - **a Nix-built image:** agentsview needs a Go and a Node build; its published image, pinned by digest, is the same bytes every time;
  - **a PVC for its database:** the index rebuilds from the log volume in under a second. Stars, labels and renames are lost on a restart, which is fine for a read-only viewer.

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
  - The session ID comes from `<runId>-<stage>/state/session` on the session-log volume, which the inbox mounts read-only at `/sessions`, as the viewer does (D2). So the inbox runs in `factory8-sandboxes` too. The adapter writes that file when the session starts.
  - The link is `<FACTORY8_VIEWER_URL>/sessions/<id>`, agentsview's form. On a phone that doesn't hold the token yet, it opens the token form first, then the session (D1).
  - `askId` is a hash of run ID, stage and question, so the same question keeps its ask, and its single push, across inbox restarts.
- **The answer.** The ask's sink refuses a reply that is blank once trimmed, as `f8 answer` does, and leaves the ask open. Otherwise it re-queries `state` and checks two things:
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
  - **the session ID in the run's `state`:** it would mean a new field in the adapter's exit event, in the worker and in `RunState`, just for a link; the file is already on the log volume, which the viewer mounts anyway.

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
- **Whoever holds the viewer's token can run commands in its pod,** through agentsview's custom terminal (D1). → The pod has the log volume read-only, no ServiceAccount token and no other Secret, but it reaches the cluster network, Temporal included. The gap goes under "Not in the POC" with the token-only gate (8.0). A NetworkPolicy that denies the pod's egress closes it later.
- **Both third-party pieces are small projects, and Collie's wire is experimental.** → Pin both: the viewer by its image digest, the SDK at an exact version. Each piece only reads the log volume or talks to Temporal, so replacing one touches no workflow. `f8 answer` always works.
- **agentsview names a project by the repo alone.** Two repos of the same name under different owners share a project. → Rare within one installation; one of them can pin a different `workdir` (D8).
- **`project.yaml` is read with a one-line match, not a YAML parser.** A `workdir` written in another YAML form, such as a flow mapping or a quoted key, isn't seen, and the path falls back to the URL. → Our example shows the one form, and the shortcut in D8 names the upgrade.
- **A step waiting on a question across the adapter change** would resume in a fresh checkout at the new path. The old session is filed under `-f8-work`, so `--resume` fails and the adapter falls back to a fresh session with the handoff note. Any uncommitted work in `/f8/work` is left behind. → Deploy the new sandbox image when no run waits on a question (Migration Plan).
- **Collie may not trust the cluster CA.** → Spike 8.2. The fallback is the localhost sidecar in D5.
- **A late tap between the inbox's check and its signal.** → The workflow guard (D6) drops it. The cost is that the second answer's sender sees "taken" while the run ignored it. That's rare, and the pane closes on the next poll.
- **An open-run scan every 10 s.** → Fine at POC scale; the shortcut in D5 names the upgrade.
- **The log volume holds every kept step's logs.** → The viewer lists all of them, until retention removes them (ART-10, Phase 2).
- **The viewer and the inbox run in `factory8-sandboxes`,** beside the untrusted sandboxes, to mount the log volume. → In the POC no NetworkPolicy separates the namespaces anyway. Neither pod has a ServiceAccount token, and each holds only its own token.

## Migration Plan

1. The workflow guard (D6) ships with the next worker image. A run in flight replays deterministically, because the handler issues no commands.
   - Ship the adapter change (D8) at the same time: rebuild the sandbox image, and put its tag in `deploy/worker.yaml`. Do it when no run waits on a question (`f8` shows none).
   - split-session-logs is deployed first (its 7.1): the viewer and the inbox mount its volume.
   - Steps kept from before reach the viewer only if they were copied into the log volume (split-session-logs 7.2), and it shows them as one "work" project.
2. *user*: put the two tokens in OpenBao, then `kubectl apply -k deploy/` with `viewer.yaml` and `inbox.yaml` after importing both images.
3. *user*: attach the inbox in Collie (D5).

Rollback: delete the two Deployments and detach the inbox in Collie. Nothing else depends on them.

## Open Questions

- Codex and pi sessions: when a sandbox first runs Codex (AGT-2, Phase 1), the adapter links `~/.codex/sessions` onto the log volume as it does Claude Code's projects (split-session-logs D2), the farm links those folders too, and the viewer gets `CODEX_SESSIONS_DIR`. This is deferred because no sandbox writes them yet.
