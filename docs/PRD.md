# PRD: Factory8 — AI-Native Software Factory

**Status:** DRAFT v0.6 · **Basis:** AI-Native SDLC Playbook (`SDLC_Playbook_Essentials.md`) + architecture decisions and PRD review of 2026-10-20 + hands-on tests of Optio and SuperPlane (2026-10-21/22) + adapter contract review (2026-10-22) · **Owner:** project author
**Stage:** personal prototype on the author's own project; target: a single-tenant offering installed per client.
Summary pages: `site/prd.html`, `site/architecture.html`.

> Items not stated by the playbook or by the product owner are marked **[ASSUMPTION]** or listed in §13; open questions are in §14. Requirement IDs are stable; retired so far: ART-5 (v0.3).

## 0. Changes

### v0.6 (from v0.5)

| Change | Effect |
|---|---|
| **Same model, separate sandboxes** (DEP-2, DEP-11) | A verifier may use the author's profile: independence comes from its own sandbox and an empty session, which see the author's work only through git and the forge. M5's reviewer model and M6's review and diagnose bands no longer have to differ from the authors', so an installation with one model can run every stage. DEP-2's routine-route verifier follows the same rule; another vendor is optional, not a goal |
| **M5: the SDLC run in Phase 0** (BLD-1, DEP-1, DEP-11, ORC-3, §8) | A run becomes the plan → build → review/fix chain, pulled forward from Phase 1 right after M1 and before M2–M4, so progress, questions and recovery apply to a multi-step run from the start. Each step runs in its own sandbox and sees earlier steps only through the run branch and the PR; the review step runs on the installation's reviewer model, which differs from the author's (DEP-11), and posts severity-ranked findings (DEP-1); at most 2 fix rounds (ORC-3). The run ends at a PR ready for the human to merge or not — no agent merges. §8: Phase 0 gains M5; Phase 1 keeps the gates, intake, spec and routes, without the plan and PR review steps |
| **M6: the ship run in Phase 0** (ORC-2, ORC-3, ORC-5, TST-2, TST-3, TST-5, MNT-6, DEP-11, AGT-3, §8) | A second Phase 0 workflow, modelled on the dark-factory plugin, takes one issue through graded stages, each in its own sandbox: design, design review, tests first by a separate agent, tests review, implement, code review, finish. Stage prompts are skills in a `factory8` plugin, pinned to the run's start (ORC-2, AGT-3). Implement attempts climb a model ladder; high-risk work gets two reviewers and a tie-break; two failed attempts get a diagnosis (causes A–I) that routes the run (ORC-3, DEP-11, MNT-6's shape). The code reviewer runs the repo's checks and quotes their output (TST-2) and checks that the acceptance tests are unchanged (TST-3: enforced by an agent, not a gateway, until #1); an independent reviewer in a fresh sandbox re-checks each attempt (TST-5). A run that needs a human waits on a signal with no pod (ORC-5), so M3's workflow wait and `f8 answer` move here. The run ends at a PR ready for the human; no agent merges. §8: Phase 0 gains M6 after M5, before M2–M4 |
| **M7: a task queue per project, and workflows a project owns** (new ORC-14; ORC-2, ORC-7, PLT-8, SBX-17, §8) | Every run of a repo, built-in flow or not, runs on that repo's own task queue, served by the shared worker or by a worker the project builds. A project may own workflows: TypeScript Temporal workflows in its repo, built with Factory8's worker and built-in flows into a worker image that runs only Factory8's activities, so a project's flow no longer needs a Factory8 release. v0.3's "written by platform engineers with their agents" now also covers a project's engineers, for that project's flows. A worker image pins the Factory8 commit its built-in flows and the `factory8` plugin's skills come from, replacing M6's pin to the run's start: a run's code and skills always match, and a skill change ships with a worker image. SBX-17's build workflow builds project worker images too when it lands. ORC-6 and ORC-7 stay Phase 1 and apply to project workflows then. §8: Phase 0 gains M7 after M6 |
| **M8: read sessions, answer from the phone** (new PLT-9, PLT-10; PLT-5, AGT-11, PRJ-1, §4, §8, §12) | Every step's agent session can be read in a third-party, read-only web viewer that reads the run volumes in place, grouped by repo and labelled by run and stage, also from a phone (PLT-9). It never starts or messages an agent and holds no credentials, so §4's non-goal and PLT-5 now exclude only a Factory8-built web UI. A run waiting on a human reaches the engineer's phone through Collie with its question and a link to its session; a reply there is the run's answer, and `f8 answer` stays sufficient (PLT-10, invariant 14). Each sandbox's checkout moves to `/f8/<owner>/<repo>`, so sessions group by repo; a repo can pin that name with `workdir` in `.factory8/project.yaml`, the file's first key, ahead of the rest of its Phase 1 schema (PRJ-1). §8: Phase 0 gains M8 |
| **Session logs kept** (new AGT-11) | Every agent session's log files (vendor session `*.jsonl` plus the adapter's event log) are collected into object storage per run and step, so a session can be restored — after its sandbox died, in a new sandbox or in an engineer's terminal — and analysed later |
| **Adapter runs in the sandbox** (AGT-1, SBX-3) | The adapter is a daemon inside the sandbox; a worker starts each step through it and polls its event stream, which feeds the heartbeats (ORC-13). A worker restart drops a poll, not the agent. The sandbox accepts inbound traffic only from workers to the adapter port. Vendor hooks may be used inside the adapter, never as a path to the control plane: anything a hook can reach, the agent can too |
| **Questions through `f8-ask`** (SBX-11, A15) | The agent asks by running `f8-ask "<question>"` in the sandbox, which records the question for the adapter; the same for every CLI. Claude Code's own `AskUserQuestion` was the first choice, but headless mode doesn't offer it, even when requested explicitly (A15, tested on 2.1.289) |
| **Nix first** (PRJ-1, PRJ-6–8, SBX-16, A14, OQ-22; Phase 0/4) | Factory8 is built for the author first, and all their projects are Nix-based. The first environment provider reads the repo's Nix dev shell (`flake.nix` or `shell.nix`). Dev Containers move to Phase 4, before client installs; Flox or a plain Dockerfile can still be added later |
| **LLM gateway = LiteLLM** (AGT-6, PLT-8, A6) | Off-the-shelf; target design: per-step LiteLLM virtual keys (budget, expiry, run ID), deleted on exit or suspend. The pilot installation reuses the author's existing LiteLLM, in its own namespace on the cluster Factory8 runs on; Temporal gets its own Postgres. LiteLLM cannot also proxy git: its pass-through re-encodes request bodies as JSON |
| **POC first: credentials in the sandbox** (invariant 5, ART-4, AGT-6, SBX-5; [#1](https://github.com/factory8/factory8/issues/1)) | To reach a working POC fast, Phase 0 passes a GitHub token and one static LiteLLM key to the sandbox as a Kubernetes Secret, and the agent pushes directly; there is no git gateway yet. This knowingly breaks invariant 5 until #1 is fixed — before any client install and before any repo with collaborators other than the author. Hardening is tracked as `hardening` issues, not designed up front |
| **Dogfooding; phase order** — OQ-3 resolved (§8, G11, A5) | Factory8 is developed with Factory8: once the thinnest loop works (M1), Factory8's own changes go through Factory8 runs, and each later piece is used on the next change. `librepod/marketplace` is the pilot alongside it. Phase 0 is delivered as four increments, each usable as soon as it lands: M1 issue → sandboxed agent → draft PR; M2 live progress and session logs; M3 questions with suspend/resume; M4 recovery from stalls and sandbox death |
| **`project.yaml` postponed** (PRJ-1, OQ-16) | Phase 0 runs on what the repo already has — Nix dev shell, `AGENTS.md`, the CLI's native skills and MCP config — plus installation defaults (agent profile, egress allowlist). The schema is written when a feature first reads it (Phase 1: commands, checks, route rules, egress and secret requests) |
| **Pilot repo named** (A11) | `librepod/marketplace` on GitHub: Nix dev shell, `AGENTS.md`, project skills |
| Fixes | AGT-9, NFR-9: session files are opaque to workflows, but stored raw for restore and analysis (AGT-11); the §7 question flow now says the agent asks with `f8-ask`, not through its CLI's question tool and an adapter hook (SBX-11, A15) |
| Contract drafts moved (OQ-16) | The Phase 0 contract drafts moved from `specs/phase0-contracts.md` to OpenSpec specs (`openspec/` at the repo root): the built adapter is the `agent-adapter` spec, and the rest are delta specs in the M1 change. This changes only where our working notes live; no requirement changed |
| Session logs stay on the run's volume (AGT-11, SBX-15) | Session logs are no longer uploaded to object storage: they stay on the run's PVC, which is kept after the run's sandboxes are deleted until retention removes it. Claude Code resumes from the session file alone, even in a fresh home directory (tested on 2.1.289), so restoring needs no store. Object storage keeps evidence (ART-12) |
| **Sandboxes are plain Kata pods** (SBX-1, SBX-8, SBX-11, SBX-13, SBX-16, A8) | agent-sandbox is dropped. The worker creates each sandbox itself: a pod on the Kata `RuntimeClass` and a PVC, both named after the run. Suspend deletes the pod and keeps the PVC; resume starts a new pod on it. Why: in v1.0.8 its core does little more than that, and its template layer needs workarounds (a claim requires a warm pool; a template adds a NetworkPolicy that blocks the worker and DNS by default). Warm pools (SBX-8) are designed when Phase 2 needs them |
| **No permission checks in sandboxes** (BLD-6, AGT-3) | Agent CLIs always run with their permission checks off, not just by default (Claude Code: `--dangerously-skip-permissions`, with `IS_SANDBOX=1` so it runs as root): the agent is root in its microVM and decides on its own what to do. The microVM is the boundary; gates and gateway policy are the human controls. Agent profiles no longer carry tool permissions |

### v0.5 (from v0.4)

| Change | Effect |
|---|---|
| **Terminal and forge first** (invariant 14, G9, PLT-5, NFR-8) | Factory8 is for engineers who already run agents in the terminal (Claude Code, Codex, pi …). Every human action — filing, answering, accepting, inspecting a run — works from the forge and the `f8` CLI. No web UI is built until a need is proven |
| **Project agent** (new PRJ area §9.13, invariant 15, G10) | A repo's agent is built from the repo's own files plus a small `.factory8/project.yaml`: environment (SBX-16–18), context, commands, tools (skills, MCP servers, CLIs), default profiles, and the egress and secrets its tools need. Every session on the project starts from it; it is checked before use and works the same in an engineer's own terminal |
| **Reuse `devcontainer.json` and `AGENTS.md`** — OQ-22 resolved (PRJ-1, PRJ-8) | The environment comes from the repo's `devcontainer.json`, context from its `AGENTS.md`; `project.yaml` adds only what they can't express. Environment sources are an extension point (environment providers): devcontainer first; Flox, a Nix flake or a plain Dockerfile can be added later without touching workflows, templates or adapters |
| **Custom LLM providers** (AGT-10) | Adapters point each vendor CLI at the LLM gateway through the CLI's own settings (e.g. `ANTHROPIC_BASE_URL`); the gateway routes to any provider the installation configures, including self-hosted and API-compatible endpoints |
| **No silent stalls** (ORC-13) | Every step heartbeats with its latest progress; a step that stops progressing is retried, then escalated, instead of sitting in "analyzing" |
| **Prior art tested and rejected** | Optio never launched an agent; SuperPlane imported issues but stalled in "Analyzing". Neither has a per-project agent, lets Claude Code use a custom provider, or runs agents in microVMs, and both are UI-driven. Those gaps are now the requirements above |
| **PVC storage** — OQ-21 resolved for the pilot | The pilot's single-node k3s uses its NFS provisioner for sandbox PVCs (networked, so nothing is pinned to a node); client installs choose per installation. The Phase 0 suspend spike (A8) runs on NFS |
| **Routine PR approval** — OQ-20 resolved (DEP-2) | On `routine`, an independent verifier (different profile, ideally vendor) plus deterministic checks approve the PR; the release gate stays human. An installation can require human approval on every PR |
| **Route rules** — OQ-5 resolved (PRJ-9) | Each project's `project.yaml` defines what is `high-risk` (sensitive paths, security issues), `routine` (catalog patterns only, no new deps/migrations/protected paths, under a size limit) and `novel` (everything else), within installation floors. New projects start `novel`; a decision model can replace the rule table later |
| **Vendor order** — OQ-18 resolved (AGT-2) | Claude Code first (Phase 0), Codex second (Phase 1), pi third (via the conformance suite, Phase 2) |
| Fixes | ART-6 and §7: forge commands are polled like intake (INT-3), not received by webhook; ART-8 (non-engineer intake) moved to Phase 3 as S |

### v0.4 (from v0.3)

| Change | Effect |
|---|---|
| **Intake** (new INT requirements, §9.5) | Intents from any source pass through one envelope and one IntakeWorkflow. The first adapter polls GitHub issues; agent triage (screen, classify, reproduce, ask) ends in a draft intent that a maintainer `/accept`s. The prototype picks up only the owner's issues; controls for outside reporters come before opening up (INT-10). PLN-1/3, ART-1/8, MNT-3/4 now point to INT |
| **Stack** — OQ-19 resolved (PLT-8) | Factory8's own code is TypeScript on Node LTS. Bun was set aside: the Temporal TS SDK supports it only experimentally |
| **Project environments** (SBX-16–18, OQ-22) | Each repo declares its agent environment; Factory8 builds it into a per-project image and `SandboxTemplate`, so every session — any user, any run — starts with the toolchain and dependencies installed instead of reinstalling them each step. Images are built outside sandboxes from the default branch only; run-branch changes are installed per run |

### v0.3 (from v0.2)

| Change | Effect |
|---|---|
| **Beads and Dolt dropped** | Artifacts are issues/files/PRs in the git forge; process state stays in Temporal; evidence goes to object storage. No Dolt server. OQ-14 closes (files are edited directly); ART rewritten, ART-5 (renderer) retired |
| **Formulas dropped** | The SDLC and sub-processes are Temporal workflows in code, written by platform engineers with their agents. Loops/branches are plain code; versioning via Temporal worker versioning + replay tests (ORC-2/3/6/7) |
| **Routes** (ORC-11/12) | Each run has a route — `routine` / `novel` / `high-risk` — deciding which human gates apply. Routine = humans at intent and release only. Agent proposes, human confirms at the intent gate; any step can escalate, only a human de-escalates |
| **Suspend/resume** (SBX-11–13, AGT-9) | A run waiting on a human holds no compute, including mid-step questions: the Sandbox is suspended (pod gone, PVC kept) and the agent's session resumed later. Artifacts stay the source of truth; a session is a cache |
| **Tenancy** — OQ-17 resolved | One Factory8 installation per client; nothing crosses installations (new TEN area) |
| **Security hardening** (SBX-14, BLD-8) | Package egress read-only via mirrors; agent branches run CI without secrets. Designed in now, implemented before client use (Phase 4) |
| **Auth/roles deferred** | Prototype records identities (from the forge), enforces no roles; AuthN/RBAC before client use (PLT-7) |
| **Pilot** — OQ-2 resolved | The author's own project; one person plays every human role |
| Fixes | AGT-2 (2nd vendor) moved to Phase 1 to match its text; DEP-6 no longer depends on the Phase 2 deploy gateway; G3 metric can't be met by silence; goals point to §11; new Phase 4 (client-ready) |

## 1. Summary

Factory8 runs the full SDLC (Plan → Design → Build → Test → Deploy → Maintain) as a **closed loop**. Intents arrive from any source — first, the project's GitHub issues — through one **intake** contract; agents triage them and a human accepts them. **Temporal workflows**, written as code, drive each run. Artifacts — intent, spec, plan, code — live in **git** and are reviewed in the forge; evidence goes to **object storage**. **Any agent CLI** executes steps inside **disposable Kata microVMs** that reach the outside world only through **gateways**; a run waiting on a human holds no compute. Each repo declares its **project agent** — environment, tools, context and profiles — so every session starts ready to work on that project. Factory8 is built for engineers who already work with terminal agents: they drive it from the **forge and the `f8` CLI**, with no new UI to learn. Humans govern at gates, and the number of gates depends on the run's **route**: novel work gets a human at every stage, routine work only at intent and release. Policy is enforced by the platform as the agent acts, not discovered in later review.

## 2. Problem

- Agents make code cheap; the human-speed stages around Build (requirements, review/test, release) are the bottleneck.
- Controls designed for human-written code (line-by-line review, weekly committees) don't scale to agent output.
- Handoffs between stages are manual and lossy; maintenance is reactive; process knowledge and policy depend on one vendor's agent configuration.

## 3. Goals

| # | Goal | Measured by (§11) |
|---|---|---|
| G1 | Idea → accepted spec → merged PR in hours/days without losing accountability | stage cycle times; human minutes per run |
| G2 | Every change has a complete audit chain: intent → spec → plan → diff → review → release | chain completeness = 100% |
| G3 | Policy applied at authoring time and enforced deterministically by the platform | prod gate violations = 0; policy-citing findings per reviewed PR trending down |
| G4 | Agents act up to the production gate and never past it; no agent approves its own work | 0 agent-authorized prod releases |
| G5 | Production signals re-enter the pipeline as intents automatically | breach→intent time |
| G6 | Human attention concentrated at gates, and shrinking as a codebase's patterns mature | review time/PR; % runs on routine route; human minutes per run |
| G7 | **Vendor independence:** swapping or mixing agent vendors needs no change to workflows, artifacts or controls | same workflow passes with ≥2 vendors |
| G8 | **Durable, resumable runs:** failures retry or resume without re-prompting; waiting costs no compute | % runs completing without manual restart; pod-hours held while waiting = 0 |
| G9 | **Terminal and forge first:** engineers drive Factory8 from the forge and their terminal; no new UI to learn | human actions needing anything but forge or CLI = 0; time to onboard a project |
| G10 | **Project-ready agents:** an agent starts on a project with its dependencies, tools and context in place | sandbox ready time; share of step time spent installing; steps failed for a missing tool → 0 |
| G11 | **Dogfooding:** Factory8 is developed with Factory8 from M1 (§8) | share of Factory8's merged PRs that came from a Factory8 run |

## 4. Non-goals

- Removing humans from intent acceptance or production release. Other gates are skipped only on a route a human confirmed.
- Fully autonomous production deploys.
- Displacing Jira/Confluence/ServiceNow/Figma; they are linked per artifact (XC-1).
- Building agents or models. Evaluating models/vendors beyond the adapter contract.
- A custom workflow DSL or a custom artifact database (Temporal code and git instead).
- A shared multi-tenant control plane; isolation is per installation (TEN-1).
- Multi-cloud / hosted SaaS in v1 (on-prem k3s only).
- A Factory8-built web UI until a need is proven: the forge and the `f8` CLI are the interface (PLT-5). One can be added later on the same API. Reading agent sessions is met by a third-party read-only viewer (PLT-9).
- **Prototype only:** authentication and role enforcement inside Factory8 (PLT-7, Phase 4).

## 5. Users & roles

Primary users are engineers who already run agents in the terminal (Claude Code, Codex, pi …); they reach Factory8 through the forge and the `f8` CLI. In the prototype the author holds every human role; roles are recorded, not enforced.

| Role | Interacts with | Responsibility |
|---|---|---|
| Originator (any employee; later outside reporters) | Intake, Plan | Files the issue/request; answers triage questions; corrects intent |
| Product owner | Plan, Design | Accepts intent and its route; reviews spec; resolves flagged concerns |
| Policy owners | Design, policy bundles | Own policies; sign off changes |
| Engineer | Build, Test, project agent | Approves plan; reviews artifacts; maintains the project agent (PRJ) |
| Tech lead / architect | Build, Deploy | Approves high-risk changes; owns review policy and pattern catalog |
| Code owner | Deploy | Approves PRs (route-dependent, DEP-2) |
| Platform engineer | All | Builds/operates Factory8 (Temporal, workflows, gateways, sandbox templates, adapters) |
| Release manager | Deploy | Sole authorizer of production release |
| Service owner / on-call | Maintain | Triages agent-written intents |
| Leadership, change mgmt, compliance | Governance | Define gates that must survive |
| Auditor | Evidence | Reads forge history, Temporal history/archive, gateway logs |

## 6. System invariants

1. **Artifacts live in git.** Intent (issue), spec and plan (markdown on the run branch), code (commits) and review (PR) are in the forge; evidence is in object storage, linked from the PR. Forge history is the audit trail.
2. **Temporal owns process state** — stage, route, retries, timers, waits — and passes references (repo@sha, object keys), never artifact contents. Temporal history is retention-bound, so every gate decision is also recorded in the forge.
3. **The process is code.** The SDLC and every sub-process are versioned Temporal workflows.
4. **Agents are untrusted and disposable.** A sandbox runs only while an agent works; no standing credentials. A persisted agent session is a cache: losing it costs time, never correctness.
5. **Gateways are the only door.** Git, LLM, deploy are reachable only via gateways with scoped, short-lived per-run tokens. *(Phase 0 POC exception: a GitHub token and a static LLM key in the sandbox, [#1](https://github.com/factory8/factory8/issues/1).)*
6. **Humans review in the forge;** accept = approval/command → signal; Temporal advances.
7. **Enforcement is platform-level**, identical for every agent vendor.
8. **Agent output is untrusted input** to the next agent (data, not instructions).
9. **One declared source of truth per artifact** (git by default); others linked.
10. **Agent identity ≠ human identity** in all logs.
11. **Humans own the route.** Agents may propose fewer gates and may escalate; only a human, or a rule a human approved, removes a gate.
12. **One installation per tenant.** No code, artifacts, context, lessons, evals or credentials cross installations.
13. **Intake is the trust boundary.** Text from any source is untrusted data; only an intent drafted by Factory8 and accepted by a human with write access drives a run.
14. **Terminal and forge first.** Every human interaction — filing, answering, accepting, approving, inspecting a run — works from the forge and the `f8` CLI; nothing requires a Factory8 web UI.
15. **Agents work as the project's agent.** Every session on a project starts from that project's declared agent (environment, tools, context, profiles) at a recorded version; a step installs only what its own branch changed.

## 7. Architecture (logical)

Control plane (trusted, one per installation): Temporal (+Postgres) · intake adapters (pollers) + IntakeWorkflow · SDLC workflows + workers (a task queue per project; a project may run its own worker with its own workflows, ORC-14) · git gateway → forge (commands polled → signals) · `f8` CLI over the control-plane API · LLM gateway (any configured provider) · deploy gateway (MCP tools) · object storage (evidence) · sandbox manager (the workers create Kata pods and PVCs directly) · project agent builder (image + template, checks) + registry. Execution plane (untrusted): Kata microVM sandboxes started from the project agent's image, running the agent adapter daemon (polled by workers) + any CLI, with a PVC for workspace and session · egress proxy with allowlist → read-only package mirrors · secret-free CI runners for agent branches. Diagram: `site/architecture.html`.

Run shape:

```
GitHub issue (owner) ─poll─▶ IntakeWorkflow: screen → classify → reproduce → ask → draft intent
  maintainer /accept route=routine ──▶ SDLC run
  design   ─▶ spec.md on run branch, draft PR   ── gate unless routine
  plan     ─▶ plan.md                           ── gate unless routine
  build    ─▶ commits; evidence → object storage
  review   ─▶ findings on the PR                ── code-owner gate (routine: independent verifier, DEP-2)
  deploy   ─▶ deploy gateway                    ── release gate, always human
```

Mid-step wait:

```
agent asks with `f8-ask "<question>"` and ends its turn (A15) ─▶ adapter reports needs_input (question + handoff note)
  workflow: suspend the sandbox (pod deleted; PVC kept) ─▶ post question on issue/PR ─▶ wait for signal
human: /answer … on the issue/PR, or `f8 answer` ─▶ signal ─▶ resume the sandbox (new pod on the same PVC) ─▶ project setup command ─▶ fresh tokens
  adapter: vendor session resume with the answer (e.g. `claude -p --resume <id>`, `codex exec resume <id>`)
           or, if unsupported/missing, a fresh session from handoff note + answer + branch
```

Stage gates do not suspend: the sandbox is deleted and the next stage starts fresh from git, so it can use a different vendor and carries no hidden transcript state.

## 8. Phasing

| Phase | Name | Content | Exit criterion |
|---|---|---|---|
| 0 | Platform skeleton, dogfooded | Delivered as increments, each used on Factory8's own repo as soon as it lands. **M1** `f8 run <issue>` → a one-step workflow → a sandbox from the repo's Nix dev shell (PRJ-1–3, PRJ-8, SBX-16) → Claude Code through the adapter (AGT-1) and LiteLLM with a custom provider (AGT-10), pushing with a GitHub token from a Secret (POC shortcut, #1) → a draft PR. **M2** step heartbeats and live progress (ORC-13), session logs (AGT-11), `f8 runs`. **M3** suspend/resume on a mid-step question and `/answer` on the issue (the workflow's wait and `f8 answer` come with M6). **M4** retry after a forced failure, a stall or a sandbox death. **M5** the SDLC run: plan → build → review/fix, a sandbox per step so the reviewer works isolated from the author (DEP-11), at most 2 fix rounds (ORC-3), ending at a PR ready for the human. **M6** the ship run: design, tests first, implement, graded reviews, a model ladder, diagnosis and routing, human waits, with stage prompts as `factory8` plugin skills. **M7** a task queue per project, and workflows a project owns, built with Factory8's built-in flows into the project's own worker image (ORC-14). **M8** every step's session in a read-only viewer, also from a phone (PLT-9), and a waiting run answered from the phone (PLT-10). Underneath: Temporal + Postgres, object storage, egress proxy | On Factory8's own repo and the pilot (`librepod/marketplace`) a workflow runs steps in sandboxes started from the project agent (dependencies, tools and context in place) with model traffic through a custom provider; it commits a result to the run branch, survives a forced failure and a stalled step, and resumes an agent after an answer given from the CLI or the issue, with no pod held while waiting; Factory8's own changes are made through Factory8 runs |
| 1 | Guided loop | Intake: envelope, IntakeWorkflow, GitHub issue poller (owner-only), triage, draft intent + `/accept`; design (spec.md in draft PR); gates via forge signals; route recorded on every run (all gates still on); policy bundles; deterministic platform controls; project agent builds and checks (SBX-17, PRJ-4/5); full `f8` CLI; Codex as 2nd vendor (AGT-2) | An owner-filed GitHub issue → triaged, accepted intent → merged PR, with humans at every gate; the same workflow passes with 2 vendors |
| 2 | Routine route + delivery | Routine route enforced (route rules, escalation, pattern catalog); eval suite; adapter conformance suite + pi as 3rd vendor (AGT-2/7); parallel runs; per-project warm pools and caches (SBX-18); project agent local parity and `f8 project init` (PRJ-6/7); deploy gateway + autonomy tiers; rehearsed rollback | A routine change reaches release with humans only at intent and release; rollback proven |
| 3 | Closed loop | Detection + bands; headless diagnose/propose with confidence gates; incident→eval; chat bridge and chat intake (ART-8) | Breach yields a triaged intent without a human starting it |
| 4 | Client-ready | Packaged single-tenant install; Dev Containers environment provider (PRJ-8); AuthN/RBAC; read-only package egress; secret-free agent CI; per-installation LLM provider allowlist; outside-reporter intake controls (INT-10); retention/compliance (OQ-11) | A second installation stands up from git with no shared state; SBX-14 and BLD-8 verified by test |

## 9. Functional requirements

Priority: **M** must · **S** should · **C** could. `[n]` = phase. ★ = new or rewritten since v0.2.

### 9.1 ORC — Orchestration
| ID | Requirement | P |
|---|---|---|
| ORC-1 | Each SDLC run is a Temporal workflow; per-run stage, route, history and pending gate are queryable. [0] | M |
| ORC-2 ★ | The SDLC and each sub-process are Temporal workflows in TypeScript (PLT-8). Per-step settings — agent profile, sandbox size, egress profile, timeouts — are config passed to the workflow, not hardcoded. [0] | M |
| ORC-3 ★ | Independent steps run in parallel; loops (review-fix, retry-until-green) are plain code with an iteration cap that escalates to a human. [0] | M |
| ORC-4 | Failed steps retry per policy (backoff, max attempts, non-retryable classes); exhausted retries escalate to a human with context. [0] | M |
| ORC-5 ★ | Every human wait — stage gate or mid-step question — is a Temporal signal/wait; a waiting run holds no running pod (SBX-11). [0] | M |
| ORC-6 ★ | In-flight and suspended runs keep the workflow version they started on (worker versioning/patching); every workflow change passes replay tests against recorded histories before deploy. [1] | M |
| ORC-7 ★ | The SDLC is a parent workflow (intent→spec→plan→build→test→review→deploy→maintain); sub-processes (review fix loop, incident response) are reusable child workflows. [1] | M |
| ORC-8 ★ | Accepting an artifact advances the run to the next stage with no manual prompting. [1] | M |
| ORC-9 | Maintain→Plan is a new run started with the incident intent as input, linked to the originating run. [3] | M |
| ORC-10 | Runs are cancellable and pausable by humans; all control actions audited. [1] | S |
| ORC-11 ★ | Every run carries a route: `routine` (human gates: intent, release), `novel` (all gates), `high-risk` (all gates + tech lead/architect). An agent proposes the route with reasons at intake; the human confirms or changes it when accepting the intent. Rules come from the project's `project.yaml` within installation floors (PRJ-9); the evaluator is pluggable, rule table first. Recorded from Phase 1, gates skipped from Phase 2. [1] | M |
| ORC-12 ★ | Deterministic escalation: a run leaves `routine` (gates re-inserted) when its plan introduces a pattern not in the catalog (BLD-3), a new dependency, a schema migration or a protected-path change, or exceeds the project's size limit (PRJ-9). Any step or check may escalate; only a human de-escalates. [2] | M |
| ORC-13 ★ | **No silent stalls:** every agent step heartbeats to Temporal with its latest progress (last tool call, file touched, command run); the CLI and the PR show it live. A step with no progress past its heartbeat timeout is stopped and retried per ORC-4, then escalated with its transcript. At any moment a run can say what it is doing and since when. [0] | M |
| ORC-14 ★ | Every project has its own task queue, and every run of the project, built-in flow or not, runs on it. A worker serves the queues of the projects it is set up for; each project's queue has one worker Deployment. A project may own workflows: TypeScript Temporal workflows in its repo, built with Factory8's worker and built-in flows into a project worker image that runs only Factory8's activities. A worker image pins the Factory8 commit its built-in flows and the `factory8` plugin's skills come from. `f8 run --flow <name>` starts any flow on the project's queue. A project's flows change with its own image, never with a Factory8 release. [0] | M |

### 9.2 ART — Artifacts (git-based) ★
| ID | Requirement | P |
|---|---|---|
| ART-1 ★ | The git forge is the artifact store and review surface: intent = the source's issue/ticket thread (sources without one — form, CLI, alert — get a forge issue); spec.md and plan.md on the run branch in a draft PR; code = commits; findings = PR review + summary comment; release = tag/deployment record. [0] | M |
| ART-2 ★ | Artifact formats defined (markdown + front-matter: run ID, route, status, versions in force, links) for intent, spec, plan, findings summary, lesson, eval case (OQ-16). [0] | M |
| ART-3 ★ | Every artifact change is a commit attributed to an identity (agent run or human); agent commits carry a `Factory8-Run:` trailer; the factory posts every gate decision to the forge as well as recording it in Temporal. [0] | M |
| ART-4 ★ | The git gateway is the agents' only path to the forge: the per-run token allows push to the run branch and reads of declared repos; no force-push, no protected-branch push, no forge admin API. Phase 0 POC: no git gateway yet; the sandbox pushes directly with a GitHub token from a Secret ([#1](https://github.com/factory8/factory8/issues/1)). [0] | M |
| ART-6 ★ | Reviewers edit spec.md/plan.md directly in the PR — the file is the artifact, so nothing needs ingesting (OQ-14 closed). Comments and commands (`/accept`, `/reject`, `/answer`, `/route`) reach Temporal as signals through the forge adapter, polled like intake (INT-3); the same commands exist in the `f8` CLI (PLT-5). [1] | M |
| ART-7 | External records (Jira, etc.) are linked by ID both ways (minimum linkage, XC-1). [1] | S |
| ART-8 ★ | Intake path for non-engineers: chat or form adapter (INT-1) that needs no git. [3] | S |
| ART-9 ★ | Agent-written content (commits with the run trailer, factory comments) is labeled untrusted-origin when assembling context for downstream agents. [1] | M |
| ART-10 | Retention policy for artifacts, evidence, suspended sandboxes and logs defined and enforced. [2] | S |
| ART-11 ★ | The accepted version of each artifact is recorded as a commit SHA; a later change to an accepted spec/plan reopens its gate, or on `routine` is re-checked against ORC-12. [1] | M |
| ART-12 ★ | Evidence (tool output, transcripts, screenshots) is stored in object storage by content hash, uploaded via per-run presigned URLs, linked from the PR/run, never committed to the repo. [0] | M |

### 9.3 SBX — Sandboxed execution
| ID | Requirement | P |
|---|---|---|
| SBX-1 ★ | Each agent session runs in its own sandbox: a pod on the Kata microVM `RuntimeClass` with the run's PVC, created by the workers from the project's sandbox template, with no sandbox controller; deleted when its step ends, suspended while it waits on a human (SBX-11). [0] | M |
| SBX-2 | Root/admin inside the VM is permitted (package installs, docker compose); no privileged host access. [0] | M |
| SBX-3 ★ | Default-deny NetworkPolicy: sandbox may reach only the gateways, the egress proxy and presigned object-storage URLs; no access to Temporal, the Kubernetes API, or other sandboxes. Inbound traffic only from Factory8 workers to the adapter's port (AGT-1). [0] | M |
| SBX-4 | Egress proxy allowlist for package registries, mirrors and image pulls; all egress logged. [0] | M |
| SBX-5 ★ | No standing credentials: tokens are minted per step, revoked on delete or suspend, re-minted on resume; no cloud/cluster creds. Phase 0 POC exception: a GitHub token and a static LiteLLM key from a Secret ([#1](https://github.com/factory8/factory8/issues/1)). [0] | M |
| SBX-6 ★ | Workspace per run: repo checkout on the run branch at a fixed path on the sandbox's PVC; durable results persist via the branch and object storage, not VM state. [0] | M |
| SBX-7 | Resource limits and timeouts per step from workflow config (CPU, memory, disk, wall clock). [0] | M |
| SBX-8 | Warm pools of pre-started sandboxes for common templates to cut start latency. [2] | S |
| SBX-9 | Sandbox base images are curated, versioned and scanned; image policy defined. Project images (SBX-16) build on them. [1] | S |
| SBX-10 | Step evidence captured: command/output transcript, test output, screenshots, resource use (ART-12). [1] | M |
| SBX-11 ★ | **Suspend on wait:** when the agent needs human input mid-step, it runs `f8-ask "<question>"` and ends its turn (A15), and the adapter reports `needs_input` (question + handoff note); the workflow suspends the sandbox (pod deleted, PVC kept), posts the question to the issue/PR and waits for a signal. Stage gates delete the sandbox instead. [0] | M |
| SBX-12 ★ | **What persists:** only PVC paths — the workspace (incl. uncommitted changes), the vendor session directory (e.g. `~/.claude/projects`, `~/.codex/sessions`) and the handoff note. Never credentials or gateway tokens. Root-filesystem changes, installed packages and running services are lost. [0] | M |
| SBX-13 ★ | **Resume:** on the answer signal a new sandbox pod starts with the PVC reattached at the same paths, the project's setup command re-runs, fresh tokens are minted, and the adapter resumes the vendor session with the answer; if the vendor can't resume or the session is missing, it starts a fresh session from handoff note + answer + branch. [0] | M |
| SBX-14 ★ | Package egress is read-only: sandboxes reach registries only through pull-through mirrors, or a proxy that permits only GET/HEAD to registry hosts; publish/upload endpoints and arbitrary git hosts are blocked. [4] | M |
| SBX-15 ★ | Suspended sandboxes are deleted when the run ends, is cancelled, or exceeds a max wait; the run's PVC is kept for its session logs (AGT-11) until retention removes it (ART-10); the PVC storage class is chosen per installation and must be networked on multi-node installs (pilot: NFS provisioner, OQ-21). [0] | M |
| SBX-16 ★ | **Project environment** (the environment part of the project agent, PRJ-1): each project declares its agent environment in its repo — toolchain and versions, system packages, dependency install, images for docker compose services, setup command (declared in the repo's Nix dev shell first; other formats through environment providers, PRJ-8). Factory8 builds it into a versioned project image and a per-project sandbox template (the pod spec); every agent session for that project — any user, any run — starts from it, so a step installs only what its own branch changed. The declaration controls only what is installed; runtime class, network and egress policy, resource ceilings and the adapter stay in admin-owned config (DEP-6). [0] | M |
| SBX-17 ★ | Project images (sandbox images, and worker images per ORC-14) are built by a Factory8 build workflow, never in an agent sandbox: from the default branch only, with egress through the mirrors, and private-registry credentials passed as build secrets that never reach an image layer. Images are tagged by a hash of the declaration and lockfiles, scanned (SBX-9) and pushed to the installation's registry. A change to those files on the default branch, or a scheduled patch rebuild, triggers a build; a failed build keeps the last good image and notifies the project owner. Run branches never build images: an environment change on a run branch is installed at step start for that run only and counts as a new dependency (ORC-12). [1] | M |
| SBX-18 ★ | Fast start, little traffic: warm pools per project template (SBX-8); a git mirror per repo so checkout fetches only the delta; compose service images and dependency caches baked into the image or served from in-cluster caches; targets in OQ-13. [2] | S |

### 9.4 AGT — Agent adapter (vendor-agnostic)
| ID | Requirement | P |
|---|---|---|
| AGT-1 ★ | A documented adapter contract: input = workspace + task (refs to intent/spec/plan) + context bundle + gateway endpoints/tokens [+ human answer on resume]; output = result + evidence refs + exit status `done` / `failed` / `needs_input` (question + handoff note). The adapter runs as a daemon inside the sandbox; a worker activity starts the step through it and polls its event stream, which feeds the step's heartbeats (ORC-13), so a worker restart never stops the agent. Vendor hooks may be used inside the adapter, never as a path to the control plane. [0] | M |
| AGT-2 ★ | Vendor order: Claude Code is the first adapter [0]; Codex is implemented behind the same contract before Phase 1 exit [1]; pi qualifies third by passing the conformance suite (AGT-7) [2]. [1] | M |
| AGT-3 | Workflow steps select an **agent profile** (vendor, model, effort) by name; profiles are config, not code; a project agent sets its own defaults within the installation's allowlist (PRJ-2). [0] | M |
| AGT-4 ★ | Context is vendor-neutral: the repo's `AGENTS.md` (PRJ-1) plus installation-level conventions. Adapters translate for CLIs that don't read `AGENTS.md` natively (e.g. a generated `CLAUDE.md` that imports it). [1] | M |
| AGT-5 | Policy bundles (security, compliance, brand, UX) are versioned, owner-signed, injected into context by the adapter; advisory only, with deterministic backstops in the platform. [1] | M |
| AGT-6 ★ | All model traffic goes through the LLM gateway (keys, budgets, per-run attribution, logging, per-installation provider/model allowlist). The gateway is LiteLLM (off-the-shelf, PLT-8): each step's token is a LiteLLM virtual key with a budget, an expiry and the run ID, deleted on exit or suspend (Phase 0 POC: one static key from a Secret, [#1](https://github.com/factory8/factory8/issues/1)). [0] | M |
| AGT-7 | A conformance suite runs any adapter against standard tasks; new vendors qualify by passing it. [2] | S |
| AGT-8 | Reviewer/verifier steps can use a different vendor/profile than the author. [2] | S |
| AGT-9 ★ | Session resume is an optional, declared adapter capability; session files are opaque to workflows and artifact formats (stored raw, AGT-11); the adapter may prefer the handoff path when a session is too large to re-send cheaply (NFR-7). [0] | S |
| AGT-10 ★ | **Custom LLM providers:** the adapter points each vendor CLI at the LLM gateway through the CLI's own settings (e.g. `ANTHROPIC_BASE_URL` for Claude Code, a custom provider entry for Codex) and passes a per-run gateway token as its key. The gateway routes to any provider the installation configures — vendor APIs, cloud-hosted models, self-hosted or API-compatible endpoints — and maps model names, so a profile can name any allowed model. [0] | M |
| AGT-11 ★ | **Session logs kept:** every agent session's log files — the vendor session files (e.g. `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`) and the adapter's event log — stay on the run's volume (the PVC), which outlives the run's sandboxes until retention removes it (SBX-15). Nothing is uploaded: a session restores from its own file — in a new sandbox on the same volume after its sandbox died, or in an engineer's terminal from a copy (PRJ-6) — and logs can be analysed later, and are readable in the session viewer (PLT-9). Retention per ART-10; nothing leaves the installation (TEN-2). [0] | M |

### 9.5 INT / PLN — Intake and plan
| ID | Requirement | P |
|---|---|---|
| INT-1 ★ | One intake contract: each source adapter normalizes its input into an `IntentEnvelope` (source, external ref/URL, project, author, trust tier, title, body, labels, received-at) and starts the IntakeWorkflow; nothing source-specific passes the adapter. Adapters also read the source thread, post comments and set status. [1] | M |
| INT-2 ★ | Idempotent intake: the IntakeWorkflow ID derives from source + external ref (e.g. `github/<owner>/<repo>/<n>`); edits and comments on the source reach the same run as signals (signal-with-start). [1] | M |
| INT-3 ★ | External sources (forges, trackers) are polled on a Temporal Schedule with a stored cursor — outbound-only, no public endpoint. Webhooks are optional later, with polling kept as reconciliation. In-cluster sources (form, alerts) may push. [1] | M |
| INT-4 ★ | First adapter: GitHub issues via a GitHub App (bot identity, short-lived installation tokens, per-repo install). Later: form/CLI (ART-8), alerts (MNT-3), GitLab/Gitea, Jira. [1] | M |
| INT-5 ★ | Each envelope gets a trust tier from source and author (GitHub `author_association`); per-repo config maps tiers to auto-triage / wait for a maintainer label / ignore. Prototype: only issues authored by the owner are picked up; all others are ignored (no comment, no tokens). [1] | M |
| INT-6 ★ | Triage: screen (spam, duplicate of an open issue or run), classify (bug / feature / question / docs / security), reproduce bugs in a sandbox (evidence; a failing test where possible), and ask the reporter in the source thread when needed (SBX-11; timeout → stale). [1] | M |
| INT-7 ★ | Triage ends with a draft intent posted to the source thread — in Factory8's words, with class, proposed route and reproduction evidence — then waits for `/accept`, `/reject` or `/route`. Only a commenter with write permission (checked via the forge API) counts. Acceptance starts the SDLC run, linked to the source. [1] | M |
| INT-8 ★ | Status is mirrored back to the source: triaged, accepted, PR link, released, rejected (labels/comments). [1] | S |
| INT-9 ★ | Triage runs with a read-only profile: no push, no secrets, no write tools except comments through the gateway. Build agents receive the accepted draft intent; the original text is attached only as labeled untrusted data. [1] | M |
| INT-10 ★ | Before any tier below collaborator is enabled: per-tier and per-reporter token budgets and rate limits; security reports diverted to a private channel (e.g. GitHub private vulnerability reporting) with the owner alerted, never reproduced or discussed in public; public replies pass an output filter (no internal paths, policy text or other-project content). [4] | M |
| PLN-1 ★ | Intents enter only through intake (INT-1): issues, form/CLI, tickets, alerts. [1] | M |
| PLN-2 ★ | Intent schema: problem, proposed outcome, affected users/systems, constraints, open questions, author, status, **proposed route + reasons**; assisted by an agent step that interviews the originator. [1] | M |
| PLN-3 ★ | A human accepts the intent **and its route** (INT-7); accept/reject recorded in the source thread and signalled to Temporal. [1] | M |

### 9.6 DSN — Design
| ID | Requirement | P |
|---|---|---|
| DSN-1 | Policies exist as versioned bundles with named owners and sign-off on change. [1] | M |
| DSN-2 ★ | Design step reads the accepted intent, applies policy bundles, writes spec.md with **flagged concerns** (esp. contradictory policies). [1] | M |
| DSN-3 ★ | Prompt, agent profile and policy-bundle versions in force are recorded in the spec front-matter. [1] | M |
| DSN-4 ★ | Flagged concerns route to named policy owners and must be resolved before build starts; on `routine` any flagged concern escalates the run. [1] | M |
| DSN-5 ★ | On `novel`/`high-risk` only a human accepts the spec (high-risk consults a tech lead); on `routine` the spec is accepted by the workflow once ORC-12 checks pass. [1] | M |
| DSN-6 | Front-end mock → build flow supported where an agent/tool exists. [2] | C |

### 9.7 BLD — Build
| ID | Requirement | P |
|---|---|---|
| BLD-1 | Planning step produces plan.md (files, order, risks, proof) before any code step; no code step runs without an accepted plan. [1] | M |
| BLD-2 ★ | Implementation steps run per plan; deviation updates plan.md (enforced by the workflow via ART-11, not a hook). [1] | M |
| BLD-3 ★ | The repo's `AGENTS.md` (commands, conventions, architecture, known mistakes) plus a **pattern catalog** (ADRs, accepted patterns), both part of the project agent (PRJ-1) and reviewed like code; repeated mistakes and newly accepted patterns are added via PR. The catalog is what lets a change be `routine`. [1] | M |
| BLD-4 ★ | Protected paths (incl. CI config, CODEOWNERS, factory config, the project agent definition), credential-in-diff detection, format/lint run as **platform checks** on the run branch (gateway pre-push and CI), not agent hooks. [1] | M |
| BLD-5 | Parallel runs/steps in separate sandboxes and branches; limit set by review capacity. [2] | S |
| BLD-6 | Agent CLIs always run inside sandboxes with their permission checks off and no per-edit approval (Claude Code: `--dangerously-skip-permissions`): the agent is root in its microVM and decides on its own what to do. Human control is at gates and via gateway policy. [1] | M |
| BLD-7 ★ | `high-risk` runs require a tech-lead/architect approval gate (route definition: PRJ-9). [1] | M |
| BLD-8 ★ | CI for agent branches runs on untrusted runners with no secrets and egress limited to mirrors; jobs needing secrets (deploy, signing, real integrations) run only on protected branches or after a human gate. [4] | M |

### 9.8 TST — Test
| ID | Requirement | P |
|---|---|---|
| TST-1 | Build/test/lint runnable by one command each; declared in the project agent (PRJ-1). [1] | M |
| TST-2 ★ | A step is not "done" without evidence containing the toolchain's literal output (ART-12). [1] | M |
| TST-3 | Bug fixes: failing test committed first in its own step; the gateway rejects pushes from the fix step that modify tests. [1] | M |
| TST-4 | Visual feedback loop for UI work (browser/screenshot tooling in the sandbox). [2] | S |
| TST-5 | Independent verifier step in a fresh sandbox/profile re-checks the result. [2] | S |
| TST-6 ★ | Eval suite (20–50 real tasks → prompt + checks) runs on a schedule and on any change to adapters, agent profiles, policy bundles, context templates, workflows or a project agent; a pass-rate drop blocks the change. [2] | M |
| TST-7 ★ | Every incident produces a permanent eval case in the installation's eval repo. [3] | M |
| TST-8 | Eval suite curated: non-discriminating cases retired, monitoring cases added. [2] | S |

### 9.9 DEP — Deploy
| ID | Requirement | P |
|---|---|---|
| DEP-1 ★ | Review workflow runs identical passes on every PR (bugs, security, compliance vs spec/plan/principles); severity-ranked findings posted as PR review comments + summary. [1] | M |
| DEP-2 ★ | Findings never approve/block alone. On `novel`/`high-risk`, branch protection requires human code-owner approval. On `routine`, an independent verifier (its own sandbox and an empty session, as in DEP-11; any profile, the author's included, and another vendor where the installation has one) plus all deterministic checks replace code-owner approval; the release gate stays human. An installation can set a floor requiring human approval on every PR, whatever the route (e.g. for separation-of-duties compliance, OQ-11). [1] | M |
| DEP-3 | Reviewer comments trigger a fix step that pushes to the run branch; an automated loop drives agent-opened PRs to green-awaiting-approval. [2] | S |
| DEP-4 | Repeated findings update the context file / policy bundle via PR. [2] | S |
| DEP-5 ★ | Human approval gates are Temporal signals plus gateway policy: the gateway refuses the gated action until the signal is recorded; refusal states reason and route. Prototype: the signal carries the forge user's identity; no role check (PLT-7). [1] | M |
| DEP-6 ★ | Non-negotiable controls (network policy, gateway scopes, sandbox templates, protected paths; deploy gateway allowlist from Phase 2) are cluster-admin-owned config that workflows and agents cannot override. [0] | M |
| DEP-7 ★ | CI/pipeline judgment steps (triage failures, changelog) run as workflow steps in sandboxes; write steps arrive only as PRs; no push-to-main path. [2] | M |
| DEP-8 | **Deploy gateway** exposes deploy/status/rollback as per-environment tools; agents have no other route to environments. [2] | M |
| DEP-9 | **Autonomy tiers:** dev free; staging middle; production = agent prepares, named release manager authorizes (signal), gateway enforces. [2] | M |
| DEP-10 | Rollback is a single, agent-invocable action, rehearsed regularly in staging. [2] | M |
| DEP-11 ★ | Author ≠ approver: the agent run that wrote a change cannot approve it. A verifier runs in its own sandbox with an empty session, seeing the change only through git and the forge; it may use the same profile as the author, since isolation, not a different model, is what removes the author's bias. Whether the human who requested a change may also approve it is per-installation policy (prototype: allowed; client installs: OQ-11). [1] | M |

### 9.10 MNT — Maintain / closing the loop
| ID | Requirement | P |
|---|---|---|
| MNT-1 | Deterministic, version-controlled, unit-tested detector over rolling baselines (e.g. Western Electric rules); no model in detection. [3] | M |
| MNT-2 | Tiers in config: 1σ log; 2σ read-only diagnosis (restricted tools/profile); 3σ propose via PR or pre-approved runbook only. [3] | M |
| MNT-3 ★ | Triggers: schedule, monitoring webhook, ticket, chat message; each enters through intake (INT-1). [3] | M |
| MNT-4 ★ | Agent writes findings as an incident envelope (source: maintain) that enters triage like any other intent. [3] | M |
| MNT-5 | Service owner triages fix/schedule/dismiss; dismissals tune bands. [3] | M |
| MNT-6 | **Confidence gate** between headless stages: deterministic checks plus an independent adversarial verifier (separate sandbox, ideally different vendor/profile); failure escalates to a human. [3] | M |
| MNT-7 ★ | Chat first responder with its own identity; human authorization precedes any rollback; the post-mortem becomes a lesson (PR to context file / pattern catalog). [3] | S |
| MNT-8 | Process metrics (e.g. PR cycle time drift) can drive the same loop. [3] | C |

### 9.11 TEN — Tenancy ★
| ID | Requirement | P |
|---|---|---|
| TEN-1 ★ | One Factory8 installation per client (own namespaces or cluster, Temporal, object storage, gateways, LLM keys, forge integration). No component assumes it serves more than one tenant; packaged for clients in Phase 4. [0] | M |
| TEN-2 ★ | Nothing crosses installations: code, artifacts, evidence, sessions, context, lessons, eval cases, keys, logs. Reuse across clients happens only through the Factory8 product (workflows, templates, adapters, generic policy bundles), which contains no client data. [4] | M |
| TEN-3 ★ | Within an installation each project gets its own sandbox namespace, token scopes and LLM budget. [1] | S |
| TEN-4 ★ | Each installation sets its own LLM provider/model allowlist and keys (client NDA and data-residency constraints). [4] | M |

### 9.12 XC / PLT — Cross-cutting and platform
| ID | Requirement | P |
|---|---|---|
| XC-1 ★ | Per artifact type, one declared source of truth (default: git/forge) and mandatory linkage to any external record. [0] | M |
| XC-2 ★ | For any change, the chain intent→spec→plan→diff→findings→release is reconstructable from forge history + object storage, with Temporal history as a supplement. [1] | M |
| PLT-1 ★ | Temporal, workers, gateways, controller and object storage deployed as manifests/Nix-managed config in k3s; an installation is reproducible from git. [0] | M |
| PLT-2 ★ | Backup/restore for Temporal's Postgres and object storage, recovery tested; Temporal retention/archival set so audit never depends on Temporal alone. [0] | M |
| PLT-3 ★ | Secrets managed by the platform; rotated; never present in sandboxes, PVCs or repos. [0] | M |
| PLT-4 | Observability: traces/metrics/logs per run, step, gate and gateway call; dashboards for §11 metrics. [1] | M |
| PLT-5 ★ | **`f8` CLI**, the operator interface: list runs, stage, route, pending gates and questions; answer, accept, retry, cancel; follow a running step's live progress (ORC-13); open evidence; check a project agent (PRJ-5). Built on the control-plane API; scriptable (JSON output). Beyond the read-only session viewer (PLT-9), a web UI is out of scope until needed (§4). [0] | M |
| PLT-6 ★ | Upgrade path for Temporal, controller, adapters and workflow code without losing in-flight or suspended runs. [2] | S |
| PLT-7 ★ | AuthN (SSO/OIDC) and role mapping for gates, signals, forge commands and the CLI/API. [4] | M |
| PLT-8 ★ | Factory8's own code (workflows, workers, gateways, adapters, CLI) is TypeScript on Node LTS; replay tests run on the production Node version. Off-the-shelf components keep their own languages. [0] | M |
| PLT-9 | **Session viewer:** a read-only web viewer lists every step's agent session kept on the run's volume (AGT-11), grouped by repo and labelled by run and stage, and shows its prompts, messages, thinking, tool calls with results and subagents, usable from a phone. It is a third-party tool that reads the volumes in place; it never starts, resumes or messages an agent, and holds no credentials. [0] | S |
| PLT-10 | **Phone inbox:** a run waiting on a human (ORC-5, SBX-11) reaches the engineer's phone app (Collie) with its question and a link to its session; a reply there is the run's answer signal. It is a convenience: `f8 answer` and the forge stay sufficient (invariant 14). [0] | S |

### 9.13 PRJ — Project agent ★
| ID | Requirement | P |
|---|---|---|
| PRJ-1 ★ | **Definition, from the repo's own files:** everything an agent needs to work on a repo comes from its default branch. The environment comes from the repo's own declaration — its Nix dev shell first, later e.g. `devcontainer.json` — through an environment provider (PRJ-8, SBX-16); context from `AGENTS.md` plus the pattern catalog (BLD-3). A small `.factory8/project.yaml` (its first key, `workdir`, from M8; the rest from Phase 1, each written when a feature first reads it) adds only what those can't express: commands (setup, build, test, lint — TST-1), tools (skills/commands, MCP servers, CLIs), default agent profiles per step type, route rules (PRJ-9), and the egress and secrets its tools need. Nothing is copied, so the factory and an engineer's terminal read the same files; each adapter translates for its CLI (AGT-4). [0] | M |
| PRJ-2 ★ | Every session on a project — any user, run or step — starts from the project agent at the commit pinned when the run started, recorded in the run and the spec front-matter (DSN-3); a change merged mid-run applies from the next run. Profiles it sets must be within the installation allowlist (AGT-6, TEN-4). [0] | M |
| PRJ-3 ★ | Tools are first-class: declared skills and commands are installed for each vendor CLI; MCP servers run inside the sandbox, or behind a gateway when they need credentials; every tool reaches the network only through the gateways and egress proxy (SBX-3/4). [0] | M |
| PRJ-4 ★ | Security-relevant needs are requests, not settings: extra egress hosts and secrets for project tools (e.g. a private registry, a test service) are declared by name, and an installation admin approves them into admin-owned config (DEP-6). Secrets reach only the builder (SBX-17) or a gateway, never the sandbox or the repo. [1] | M |
| PRJ-5 ★ | **Checked before use:** `f8 project check`, and the build workflow on every change, validates the definition, builds the image, runs the setup and test commands and a smoke task with each declared profile. A project whose agent fails the check takes no new runs, and its owner is told why. [1] | M |
| PRJ-6 ★ | **Local parity:** the factory uses the same environment declaration (e.g. the Nix dev shell), `AGENTS.md` and skills that an engineer's own shell, editor and agent CLI already use, so a factory run can be reproduced or continued locally from its run branch and handoff note. [2] | S |
| PRJ-7 ★ | Onboarding: `f8 project init` drafts what a repo is missing — an environment declaration from the detected toolchain (a Nix dev shell; `devcontainer.json` once that provider exists), an `AGENTS.md` (from an existing `CLAUDE.md` if there is one), a `project.yaml` — and opens it as a PR for an engineer to review. [2] | S |
| PRJ-8 ★ | **Environment providers (extension point):** one interface — detect, build image, setup command — turns a repo's environment declaration into a project image for the builder (SBX-17). The first provider is **Nix**: the repo's `flake.nix` dev shell (`devShells.<system>.default`) or its `shell.nix`. The image carries the dev shell's closure and environment plus Nix itself, so a session's shell matches `nix develop` / `nix-shell` on the engineer's machine, and a run-branch change to the Nix files is realised at step start from a binary cache reached through the egress proxy (SBX-4, SBX-17). Dev Containers (`devcontainer.json`, incl. its Dockerfile and features) is second, before client installs [4]. Others, e.g. Flox or a plain Dockerfile, can be added without changing workflows, templates or adapters; `project.yaml` names the provider when more than one applies. [0] | M |
| PRJ-9 ★ | **Route rules** in `project.yaml`: `high-risk` when a change touches the project's sensitive paths (e.g. auth, payments, infra, data migrations) or triage classed the issue as security; `routine` when every pattern in the plan is in the catalog (BLD-3), with no new dependency, migration or protected-path change, and under the project's size limit; `novel` otherwise. The installation sets floors a project can't loosen (e.g. auth and migrations never below `novel`). A new project's catalog is empty, so its runs are `novel` until patterns are accepted. Rules are evaluated by the workflow at intake and on every plan change (ORC-11/12); changing them is a protected-path change (BLD-4). The evaluator is pluggable: a decision model can replace the rule table later without changing workflows. [1] | M |

## 10. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 Security | Default-deny network; root only inside microVMs; per-run scoped tokens; no standing creds; fail closed if sandbox/runtime unavailable; read-only package egress and secret-free agent CI before client use. |
| NFR-2 Governance | Non-negotiable controls are admin-owned; only approved images, adapters, profiles, policy bundles and tools usable. |
| NFR-3 Auditability | Every action attributable (agent run vs human); decisions timestamped; forge history + object storage + gateway logs retained per policy. |
| NFR-4 Reproducibility | Workflows, profiles, policy bundles, sandbox templates, infra config all in git; spec front-matter records versions used. |
| NFR-5 Durability | Run state survives component restarts; steps idempotent or safely retryable **[ASSUMPTION]**; a lost session degrades to a handoff resume, never to a failed run. |
| NFR-6 Performance | Sandbox start and resume targets set per phase (OQ-13), measured to "project dependencies ready", not just "pod running"; first review in minutes; gateways add negligible latency. |
| NFR-7 Cost | Waiting runs use storage only, no CPU/memory; per-run and per-vendor token budgets enforced in the LLM gateway; a resumed session re-sends its whole context with a cold prompt cache, so the adapter weighs resume vs handoff. |
| NFR-8 Usability | Engineers use Factory8 from the forge and the terminal they already work in: every gate, question and status is reachable from an issue/PR and from the `f8` CLI, with no Factory8 UI to learn. Non-engineers file intents through the forge or, later, chat (ART-8). |
| NFR-9 Portability | No workflow or artifact format references a vendor-specific feature; workflows never parse vendor session files (only their adapter and log-analysis tools do). |
| NFR-10 Operability | Run on-prem k3s with a documented runbook; backups and restore drills. |
| NFR-11 Isolation | Tenant isolation is per installation (TEN-1/2). |

## 11. Success metrics

Sources: forge (issues, PRs, reviews), Temporal history, object storage, CI logs, gateway/OTel logs, incident tracker. Baselines to capture before Phase 1 (OQ-8).

| Area | Leading | Lagging |
|---|---|---|
| Intake | Issue → draft intent time; % draft intents accepted | Duplicates/spam caught; accepted intents later rejected |
| Plan | First conversation → accepted intent | Intent survival rate; intent edits after first spec |
| Design | intent→spec time | spec revisions after plan accepted |
| Build | % merged from first pass; plan accepted→merge | Rework cycles; diff-matches-plan |
| Orchestration | % runs without manual restart; retry success rate; steps stopped for no progress | Mean time to recover a failed run |
| Interface | Time to onboard a project | Human actions needing anything but forge or CLI (0) |
| Routes | % runs confirmed `routine`; human minutes per run by route | Escalations routine→novel; defects escaped from routine runs |
| Waits | Human wait time per run; resume success (vendor resume vs handoff) | Pod-hours held while waiting (target 0) |
| Vendor-independence | Pass rate of conformance suite per vendor | Same workflow success across vendors |
| Test | First-pass CI success of agent changes | Review time/PR; change failure rate |
| Evals | Pass-rate trend; incident→eval time | CI-caught vs prod-found regressions |
| Review | Time to first review; % comments auto-resolved | Pre-merge defects vs escapes |
| Gates | Gate wait time | Gate violations in prod (0) |
| Project agent | Sandbox ready time; share of step time spent installing; project agent check pass rate | Egress bytes per run; steps failed for a missing tool or dependency (0) |
| Dogfooding | Share of Factory8's merged PRs that came from a Factory8 run | Factory8 changes that had to be made outside Factory8, and why |
| Isolation | Blocked egress/denied-access events per run | Security incidents involving sandboxes (0) |
| Maintain | Breach→triage-queue intent | % findings → merged fixes; repeat incidents |

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Temporal history expires or is too large to be the record | Artifacts in git; gate decisions mirrored to the forge; workflows pass references, not contents; retention/archival set (PLT-2) |
| Agent-written workflow code breaks determinism and stalls in-flight runs | Replay tests on every workflow change; worker versioning (ORC-6) |
| Routine route lets an under-reviewed change through | Human confirms the route at intent; installation floors on route rules (PRJ-9); deterministic escalation (ORC-12); human release gate; verifier ≠ author (DEP-11) |
| Resumed agent assumes state that no longer exists (packages, services) | Setup script on resume; resume prompt lists what was not preserved; handoff note (SBX-12/13) |
| Suspended PVCs hold client code and transcripts | No creds on PVC; tokens re-minted; PVC kept after the run only for session logs, until retention removes it (SBX-15, AGT-11, ART-10); the session viewer and the phone inbox are token-gated and reachable only on the cluster's network and the tailnet, and the viewer is read-only (PLT-9, PLT-10) |
| Vendor CLIs change session formats or resume commands | Resume optional per adapter (AGT-9); CLI versions pinned in templates; handoff fallback |
| POC: an agent reads the GitHub token or LLM key in its sandbox and misuses it (push to `master`, unbounded spend) | Only the author's own repos and issues; a token scoped to those repos; fixed by [#1](https://github.com/factory8/factory8/issues/1) before any client install or outside collaborator |
| Agent with root + network exfiltrates code or acts on injected instructions | Default-deny egress + allowlist; gateways only; no standing creds; untrusted-origin labeling (ART-9); read-only registries (SBX-14) |
| Issue text injects instructions into agents | Owner-only intake in the prototype (INT-5); read-only triage (INT-9); human `/accept` of a Factory8-drafted intent (INT-7); outside-reporter controls before opening up (INT-10) |
| Agent-authored code reads CI secrets | Secret-free runners for agent branches; CI config is a protected path (BLD-4, BLD-8) |
| Vendor-agnostic dilutes quality (lowest common denominator) | Adapter contract + conformance suite; per-vendor profiles may use native strengths behind the adapter |
| Advisory policy ignored by an agent | Platform enforcement (gateways, network, branch protection, gates) for must-hold policies |
| Review capacity becomes the bottleneck | Routes remove gates as the pattern catalog grows; cap parallel runs; layered AI review; measure |
| Agent weakens tests of its own fix | TST-3 gateway rejection |
| Alert noise / runaway headless runs | Deterministic detection, σ tiers, confidence gates, budgets |
| Operational burden (Temporal, Postgres, object storage, controller, gateways) | Phase 0 skeleton first; Nix-managed config; runbooks; PLT-2/6 |
| Young dependencies (vendor CLIs) | Own the abstraction (adapter, sandbox interface); version-pin; upgrade tests |
| Node-local PVCs pin a suspended sandbox to one node | Networked storage class for multi-node installs (OQ-21) |
| NFS-backed workspaces: root inside the VM may hit `root_squash`; small-file I/O (dependency installs, git) is slow | Check both in the A8 spike; keep heavy dependency caches in the project image (SBX-16/18) and only workspace, session and handoff note on the PVC |
| Project image goes stale, grows huge, or leaks a build credential | Rebuilt on definition/lockfile change and on schedule; branch deltas installed at step start; build secrets never in layers; scanned before push; definition is a protected path (SBX-17, BLD-4) |
| Project agent drifts from the repo's own environment declaration/`AGENTS.md`, or breaks unnoticed | The repo's own files are the source; `project.yaml` holds only what they can't express (PRJ-1); checked on every change and before runs (PRJ-5) |
| A step stalls silently (hung CLI, interactive prompt, provider down) | Heartbeats with progress, heartbeat timeout, retry then escalate (ORC-13); live progress in the CLI and PR |
| Dogfooding: a Factory8 run changes the worker code it runs on | Worker deploys stay manual, behind the human release gate; a run broken by a deploy is retried; replay tests (ORC-6) move earlier if in-flight runs break |
| CLI-only interface keeps non-engineers out | Accepted: users are engineers; the forge works for everyone; chat intake (ART-8) and a web UI can come later on the same API |

## 13. Assumptions

- A1. Git forge with branch protection, code owners and an API is available (which one: OQ-15).
- A2. Org can name policy owners and approval gates.
- A3. Existing trackers stay; per-artifact authority is git/forge by default with linkage.
- A4. Metrics store exists for Phase 3.
- A5. The prototype runs on Factory8's own repo (dogfooding, from M1) and the author's pilot project (`librepod/marketplace`); one person holds every human role.
- A6. **Platform base is available:** NixOS k3s with Kata/microVM RuntimeClass was proven in a POC by the product owner; production hardening (HA, storage, upgrades) remains under PLT/NFR-10. The pilot installation runs on the author's existing single-node k3s cluster, next to their LiteLLM.
- A7. LLM providers are reachable over outbound HTTPS through the LLM gateway.
- A8. Suspend by pod deletion (PVC kept, a new pod reattaches it at the same paths on resume) works with the Kata RuntimeClass — verify in a Phase 0 spike on the pilot's NFS storage class, including file ownership for root inside the VM.
- A9. At least one target CLI resumes a session headlessly (e.g. `claude -p --resume`, `codex exec resume`) — verify per adapter.
- A10. Object storage (e.g. MinIO) runs in-cluster.
- A11. The pilot project is `librepod/marketplace`; its issues and code are on GitHub (confirmed v0.6).
- A12. Each installation has an OCI registry for project images (in-cluster or the client's) **[ASSUMPTION]**.
- A13. Each target vendor CLI accepts a custom API endpoint and key through its own settings (e.g. `ANTHROPIC_BASE_URL`) and runs headless without interactive prompts — verify per adapter in Phase 0.
- A14. A Nix dev shell (`flake.nix` or `shell.nix`) can be built headlessly in the builder into an OCI image whose environment matches the dev shell (e.g. with `dockerTools` or nix2container), and runs under Kata — verify in Phase 0. Dev Container images (reference `devcontainer` CLI) — verify before Phase 4.
- A15. ~~Claude Code in headless mode (`-p`) still offers its `AskUserQuestion` tool~~ — **false** (tested on 2.1.289: absent from `-p`, also with `--tools`, `--allowedTools` and stream-json input), so every CLI asks through `f8-ask` (SBX-11).

## 14. Open questions

| ID | Question | Needed by |
|---|---|---|
| ~~OQ-1~~ | ~~Vendor-specific vs agnostic~~ **Resolved: agnostic** | — |
| OQ-2 | ~~Pilot~~ **Resolved: author's own project**; first policy bundle still open | Phase 1 |
| ~~OQ-3~~ | ~~Phase order~~ **Resolved: skeleton first, delivered as dogfooded increments M1–M4 (§8)** | — |
| ~~OQ-4~~ | ~~Source of truth~~ **Resolved (v0.3): git/forge; beads dropped** | — |
| ~~OQ-5~~ | ~~Route definitions~~ **Resolved: rule table in `project.yaml` within installation floors; a decision model can replace it later** (PRJ-9) | — |
| OQ-6 | Confidence-gate thresholds/design (MNT-6 gives default shape) | Phase 3 |
| ~~OQ-7~~ | ~~Hosting~~ **Resolved: on-prem k3s/NixOS**; remaining: which LLM providers/budgets per installation | Phase 0 |
| OQ-8 | Baselines for §11 metrics | Before Phase 1 |
| OQ-9 | Which environments exist; where may agents act per product | Phase 2 |
| OQ-10 | Chat platform for intake/first responder | Phase 1/3 |
| OQ-11 | Compliance regimes in scope (retention, separation of duties, requester ≠ approver) | Phase 4 |
| OQ-12 | Owner / platform team / support model for the client offering | Phase 4 |
| OQ-13 | Sandbox start, resume and concurrency targets (nodes, warm pool size) | Phase 0 |
| ~~OQ-14~~ | ~~Round-trip edits~~ **Resolved: reviewers edit the files directly** | — |
| OQ-15 | Which forges: GitHub for the pilot (A11); which on-prem forge for client installs (GitLab/Gitea/GitHub Enterprise)? | Phase 0 |
| OQ-16 | Artifact formats (front-matter, file layout on the run branch), intake envelope and source-adapter interface, agent adapter contract — exact spec (drafts: OpenSpec specs in `openspec/` at the repo root); `.factory8/project.yaml` schema when first needed | Phase 0; schema Phase 1 |
| ~~OQ-17~~ | ~~Multi-tenancy~~ **Resolved: one installation per client; namespace per project** | — |
| ~~OQ-18~~ | ~~First vendors~~ **Resolved: Claude Code, then Codex, then pi** (AGT-2) | — |
| ~~OQ-19~~ | ~~Workflow language~~ **Resolved: TypeScript on Node LTS** (PLT-8) | — |
| ~~OQ-20~~ | ~~Routine PR approval~~ **Resolved: independent verifier + deterministic checks; installations may require a human on every PR** (DEP-2) | — |
| ~~OQ-21~~ | ~~PVC storage class~~ **Resolved for the pilot: the cluster's NFS provisioner; per installation for clients, networked on multi-node** (SBX-15) | — |
| ~~OQ-22~~ | ~~Environment format~~ **Resolved: behind environment providers (PRJ-8); Nix dev shell first (v0.6; the author's projects), Dev Containers before client installs, Flox or Dockerfile later if needed** | — |

## 15. Traceability

Playbook mapping: PLN→Stage 1; DSN→Stage 2; BLD→Stage 3 (+ CLAUDE.md, skills, parallel); TST→Stage 4 (+ evals); DEP→Stage 5 (+ review, approval gates, CI/CD); MNT→Stage 6; XC→Stage 3 sidebar. New (not in playbook): ORC, ART, SBX, AGT, INT, TEN, PLT, PRJ. Playbook mechanisms replaced by platform equivalents: per-repo `CLAUDE.md`, skills and `.claude/` settings → project agent (PRJ-1/3); hooks → gateways/network policy/Temporal signals (DEP-5/6, BLD-4, TST-3); managed settings → sandbox template + admin-owned config (DEP-6); `.claude/agents` subagents → workflow steps with separate profiles (TST-5, AGT-8); claude-code-action → review/fix workflows (DEP-1/3); Claude Tag → chat bridge (MNT-7).
