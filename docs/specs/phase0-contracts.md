# Phase 0 contracts

**Status:** draft · 2026-10-22 · PRD v0.6 · closes OQ-16 when complete

| § | Contract | State |
|---|---|---|
| 1 | Agent adapter | draft |
| 2 | Project detection (no `project.yaml` in Phase 0) | draft |
| 3 | Run branch layout, front-matter, commit trailer | todo |
| 4 | `IntentEnvelope` (fields only; INT is Phase 1) | todo |
| 5 | Credentials in the sandbox (POC shortcut, #1) | draft |

Rule for this document: the smallest contract that runs the Phase 0 skeleton. Anything else waits for a real need.

## 1. Agent adapter (AGT-1, AGT-9–11, SBX-11–13, ORC-13)

### 1.1 Shape

- `f8-adapter serve` is the sandbox's main process: a small HTTP server on port 7070. Only Factory8 workers can reach it (SBX-3). The NetworkPolicy is the only auth, because the agent is root in the same VM and in-VM auth would protect nothing.
- One step at a time per sandbox. The agent CLI runs as a child of the adapter, so a worker restart drops a poll, not the agent.
- Vendor specifics (CLI flags, hooks, session dirs) live only in the adapter. Phase 0: Claude Code. Phase 1: Codex.

### 1.2 API

| Call | Purpose |
|---|---|
| `POST /steps` (`StepRequest`) → `202` | Start a step. Repeating it for a `stepId` that already exists is a no-op, so activity retries are safe |
| `POST /steps/{stepId}/answer` (`AnswerRequest`) → `202` | Continue a step after `needs_input`, once the sandbox is resumed |
| `GET /steps/{stepId}/events?after=<seq>` → `{ events: StepEvent[] }` | Long-poll, up to 30 s. The worker heartbeats Temporal with the latest `progress` event and stops at an `exit` event |
| `POST /steps/{stepId}/cancel` | Stop the CLI, upload logs, exit `failed` |

```ts
interface StepRequest {
  stepId: string;                       // `${runId}.${step}.${attempt}`
  runId: string;
  prompt: string;                       // task prompt, rendered by the start-step activity (vendor-neutral)
  profile: { vendor: 'claude-code'; model: string; effort?: string };
  repo: { url: string; branch: string };   // https URL; pushed with GH_TOKEN (§5)
  logsUploadUrl: string;                // presigned PUT for this request's log archive (AGT-11)
}

interface AnswerRequest {
  answer: string;
  logsUploadUrl: string;
}

type StepEvent = { seq: number; at: string } & (
  | { type: 'progress'; text: string }  // e.g. "Bash: npm test", "Edit: src/app.ts"
  | { type: 'exit'; status: 'done'; summary: string }
  | { type: 'exit'; status: 'failed'; reason: string }
  | { type: 'exit'; status: 'needs_input'; question: string } // markdown; options listed if the agent gave any
);
```

### 1.3 Sandbox filesystem

The PVC is mounted at `/f8` (SBX-12):

| Path | Holds |
|---|---|
| `/f8/work` | Repo checkout on the run branch |
| `/f8/home` | `$HOME` for the CLI: vendor session dir (`~/.claude/projects`) |
| `/f8/state` | `request.json` (the `StepRequest`), `events.jsonl`, `session` (vendor session id), `question.md`, `handoff.md` |

Nothing secret is written under `/f8`. The POC secrets (§5) reach the CLI and git only as environment variables from the pod's Secret.

### 1.4 Lifecycle

**Start** (`POST /steps`):
1. Clone or fetch the run branch into `/f8/work`, and install a `commit-msg` git hook that appends `Factory8-Run: <runId>` (ART-3).
2. If the repo has `AGENTS.md` but no `CLAUDE.md`, write `/f8/work/CLAUDE.md` containing `@AGENTS.md` and list it in `.git/info/exclude`, so it is never committed (§2). LiteLLM's URL and key are already in the environment (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`; §5, AGT-10).
3. Run the CLI headless with tools auto-approved, since the sandbox is the boundary (BLD-6), and with a JSON event stream:
   `claude -p --output-format stream-json --verbose --permission-mode bypassPermissions --model <model>`.
   The prompt goes on stdin: the protocol preamble (§1.6), then the task prompt.
4. Turn each stream line that is a tool call into a `progress` event (tool name + its main argument), and append it to `events.jsonl`.

**Exit**, when the CLI process ends:
- If `question.md` exists → `needs_input`.
- If the exit code is 0 → `done`, and the summary is the agent's final message. The agent's claim is trusted. It commits and pushes its own work.
- Otherwise → `failed`, and the reason is the exit code plus the last stderr lines.

On every exit, the adapter first uploads `/f8/state` plus the vendor session dir as one `tar.gz` to `logsUploadUrl` (AGT-11), then reports. If the upload fails, the exit is still reported, and the files stay on the PVC for the next upload.

**Resume** (`POST /steps/{id}/answer`, after SBX-13 resumed the sandbox):
- If a session id is recorded → `claude -p --resume <id> "<answer>"`.
- If there's no session, or resume fails → a fresh session from the preamble, the task prompt, `handoff.md` and the answer.
- Phase 0 always tries resume first. Weighing resume cost against handoff (NFR-7) waits for real numbers.

**Stall or sandbox death** (ORC-13): the worker owns the clock.
- If no new event arrives within the step's `progressTimeout` (workflow config, default 10 min), the activity cancels the step and fails. Temporal then retries it per ORC-4.
- A retry runs on the same PVC. If an earlier attempt recorded a session, the new attempt resumes it, with "continue" in place of an answer; otherwise it starts fresh.

### 1.5 Questions: `f8-ask`

Headless Claude Code doesn't offer `AskUserQuestion` (A15), so every CLI asks the same way. The image puts `f8-ask` on `PATH`. `f8-ask "<question>"` writes the question to `/f8/state/question.md` and prints: "Recorded. A human will answer later. Write your handoff note to /f8/state/handoff.md, then end your turn."

Phase 0 uses no vendor hooks. If agents skip the handoff note in practice, add a Claude Code `Stop` hook that blocks until `handoff.md` exists.

### 1.6 Protocol preamble

The adapter puts this before every task prompt:

> You are working in `/f8/work` on branch `<branch>`. Commit and push your work before you finish.
> If you need a decision only a human can make, run `f8-ask "<question>"` and stop; don't guess.
> Finish with a short summary of what you did.

### 1.7 Not in Phase 0

- Codex and pi adapters (Phase 1 and 2).
- Failure classes, result verification, a resume-vs-handoff cost policy.
- shortcut: if a sandbox dies and its step is never retried (for example, the run is cancelled), the PVC is deleted without a last upload, so those logs are lost. Add a collector job that mounts the PVC if this ever happens in practice.

### 1.8 Verify in the Phase 0 spike

Verified on a host, not yet in Kata (Claude Code 2.1.289, `adapter/`): progress events from tool calls, push to the run branch with the trailer, `f8-ask` → `needs_input` + handoff note, and the answer resuming the same session.

Still to verify:

- `bypassPermissions` works when the CLI runs as root in the VM. Claude Code may require `IS_SANDBOX=1` for this.
- `--resume <id>` works after the pod was replaced and the PVC reattached (A8, A9).

## 2. Project detection (PRJ-1, PRJ-8)

Phase 0 has no `.factory8/project.yaml`. A project agent comes from what the repo's default branch already has, plus installation config. The schema gets written when a feature first reads it (Phase 1).

| Need | Source |
|---|---|
| Environment (Nix provider) | `flake.nix` exposing `devShells.<system>.default`; otherwise `shell.nix`; otherwise the project is rejected with "no environment" |
| Context | `AGENTS.md`. For Claude Code, if the repo has no `CLAUDE.md`, the adapter writes an uncommitted one that imports `AGENTS.md` (§1.4, AGT-4) |
| Skills, MCP servers | Whatever the vendor CLI reads natively from the checkout (Claude Code: `.claude/skills`, `.mcp.json`, `.claude/settings.json`) |
| Agent profile (vendor, model) | Installation default |
| Egress hosts | The installation's admin-owned allowlist (DEP-6) |

## 3. Run branch layout, front-matter, commit trailer

todo

## 4. `IntentEnvelope`

todo

## 5. Credentials in the sandbox (POC shortcut, [#1](https://github.com/factory8/factory8/issues/1))

Phase 0 has no gateways for git or LLM keys. The `SandboxTemplate` mounts one Kubernetes Secret as environment variables:

| Variable | Holds | Used by |
|---|---|---|
| `GH_TOKEN` | A GitHub token scoped to the pilot repos (contents and pull requests: write) | git, through a credential helper that reads the variable, and `gh` |
| `ANTHROPIC_BASE_URL` | LiteLLM's in-cluster URL | Claude Code |
| `ANTHROPIC_AUTH_TOKEN` | One static LiteLLM virtual key | Claude Code |

- The agent pushes its commits itself, to `f8/<runId>` by convention (the preamble names the branch). The worker opens the draft PR with the same token.
- shortcut: the agent can read both secrets and push anywhere the token allows, including `master`. Accepted for the POC on the author's own repos; #1 removes the secrets from sandboxes before any client install or outside collaborator.
