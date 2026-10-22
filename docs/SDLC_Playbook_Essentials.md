# AI-Native SDLC Playbook — Essentials Digest

Source: `AI_Native_SDLC_Playbook_designv2.md` (Louis Claxton, Anthropic). Purpose: lossless working extract to drive software-factory planning and the PRD. Section refs (§) point to the source structure. Figure 3 (play dependency graph) is not reproducible in the source; the prerequisites below are reconstructed from each play's "Prerequisites" line.

---

## 1. Thesis

- Code is no longer the bottleneck. Bottleneck moves to plan, review/test, deploy (human-speed stages).
- Controls built for human-written code (line-by-line review) don't scale; governance via weekly/monthly committees is too slow.
- **AI-native SDLC** = same control objectives, new enforcement. Linear line → **loop**, AI embedded at each point, automated handover/triggering between stages, humans "above the loop instigating, directing and governing".
- Security example: security teams are sized for human output; agents multiply output → queue grows or code ships under-reviewed. Regulated orgs can accept neither, so checks must keep pace with agents.
- Humans stay accountable for every judgment decision; human attention shifts to the artifacts that must be reviewed (and concentrates at gates, reviewing what the agent flagged).

## 2. Core mechanism: committed-artifact chain

Every stage ends by committing an artifact to version control; the next stage starts by reading it. The commit chain **is** the audit trail (who asked, what the agent produced, who approved).

| Stage | Artifact | Trigger that starts the next stage |
|---|---|---|
| Plan | `intent.md` | Product owner accepts (merge / closed review) → Design |
| Design | `spec.md` (pair with intent) | Human accepts spec → Build plan mode |
| Build | `plan.md`, then diff + tests | Merged PR → pipeline |
| Test | test output, build log, screenshot diff, eval results | Checks green |
| Deploy | PR + review findings, check runs | Code-owner approval; release authorization gate |
| Maintain | incident record, lessons file, new `intent.md` | Breached control band / ticket / channel message / schedule |

- Early stages: `.md` artifacts (human-readable *and* machine-actionable). From Build onward: code and its records.
- End state: each accepted artifact fires the next gate automatically. Adoption path: prompt each step by hand first, then automate triggers.
- Stage plays are **modular**; orgs can transform stages in any order. Each play defines: what changes, getting started (prerequisites + infrastructure), how to execute, governance, how to measure (leading + lagging indicator).

## 3. Traditional vs AI-native (the shifts)

| Stage | Traditional | AI-native |
|---|---|---|
| Plan | Committee requirements, workshops, sign-offs, hand-written | Claude synthesizes pain points from sources → `intent.md` |
| Design | Analysts write spec, designers parse it | Requirements+design in one session, standards encoded as versioned skills |
| Build | Hand-written tests/code, docs after | AI-generated tests/code; knowledge in versioned `CLAUDE.md` + skills |
| Test | QA gates at stage boundaries | Continuous evals woven through implementation |
| Deploy | Humans review every line; inconsistent governance | Layered agentic review; humans reserved for regulated/critical code; hooks as approval gates |
| Maintain | Humans watch production | Agents monitor; breached band diagnosed and written back as new `intent.md` |

---

## 4. Stage plays

### Stage 1 — Plan: capture as `intent.md`
- **Entry routes:** a person's idea, a filed ticket, or an incident/alert from Stage 6.
- **Flow:** originator describes problem in own words → Claude brainstorms, asks analyst questions (scope, users, constraints, success) → writes `intent.md` from org template (template encoded as a skill, set up by technical member, signed off by a lead) → originator corrects → commit to shared intent home. Product owner reviews/corrects agent-written intent **before** commit (applies to event-triggered and agent-originated intents too).
- **Template sections:** Title, Author/Status, Problem, Proposed outcome, Affected users and systems, Constraints, Open questions.
- **Prereqs:** none. **Infra:** Claude access for non-engineers (claude.ai or Cowork); agreed template; shared version-controlled home the product owner watches (`intent/` folder in product repo; dedicated repo only if intent spans many repos; directory in a monorepo); VCS connector (e.g. GitHub) so non-git users let Claude commit on their behalf; platform/engineering does one-time setup and decides write access.
- **Governance:** evidence = committed `intent.md` (author, timestamp, revision history). Product owner approves; accept/reject recorded as merge or closed review.
- **Metrics:** Leading — time from first conversation to committed `intent.md` (multi-week → hours). Lagging — survival rate (share accepted into Design vs closed); number of `intent.md` changes after first `spec.md` commit.

### Stage 2 — Design: requirements + design
- Claude takes accepted `intent.md`, produces `spec.md` constrained by org skills (brand, security, compliance, UX); flags areas of concern, especially contradictory policies. Product owner **reviews, doesn't write**. Policy applied while writing, not discovered in later review.
- Front-end: product owner mocks up in Claude Design (beta) from `intent.md`, iterates, exports to Claude Code.
- **Prereqs:** `intent.md`; brand/security/compliance/UX policies as skills. **Infra:** product owner with Claude access; no engineering skill needed.
- **Execution:** (1) open session with org skills + attach intent; (2) prompt names constraints, demands flagged concerns — run by hand, then codify as org-level slash command, then automate: merge of accepted intent triggers non-interactive job (org skills loaded) that commits `spec.md` as a PR; (3) PO reviews spec vs idea, checks open questions answered/carried; (4) resolve flagged concerns first, each with its policy owner, before engineering sees spec; (5) commit `spec.md` alongside `intent.md`; (6) human (PO, consulting tech lead for higher-risk) decides to progress — acceptance starts plan mode.
- **Reference prompt:** read intent.md; produce requirements+design spec for integrating into existing codebase; apply available skills (brand, security, UX); document as `spec.md` ready for engineering; describe areas of concern, esp. contradicting policies.
- **Governance:** spec, producing prompt, and skill versions in force all logged in VCS; PO signs off; flagged concerns routed to named policy owners.
- **Metrics:** Leading — elapsed time `intent.md` commit → `spec.md` commit. Lagging — `spec.md` commits dated after first `plan.md` commit (requirements rework).

### Stage 3 — Build
**Plan mode (default start):**
- Engineer starts Claude Code in plan mode (read-only on code), gives it `intent.md` + `spec.md`, asks for plan naming files that change, order of work, tests that prove it. Interrogate (what could break, riskiest step, rejected alternatives). Iterate until an engineer who never saw the conversation could implement from plan alone. Commit approved plan as `plan.md`; accept and implement (often single pass). If implementation departs, update `plan.md` in same commit (consider a hook to enforce sync).
- **`plan.md` sections:** Files that change, Order of work, Risks, Proof.
- **Prereqs:** intent/spec if exist; `CLAUDE.md` helps. **Infra:** Claude Code with repo access.
- **Governance:** design review before code is generated; plan mode blocks edits until plan accepted; plan + revisions + acceptor logged; routine changes engineer-approved, higher-risk → tech lead/architect.
- **Metrics:** Leading — share of changes merging from first pass; plan-approval→merged-PR time (from PR metadata). Lagging — rework cycles per change; how often merged diff matches `plan.md`.

**Auto mode:** engineer approves plan, Claude applies changes without per-edit prompts. Becomes default for routine work as guardrails mature (tuned `CLAUDE.md`, policy skills, blocking hooks, runnable test suite) and when spec is tight, blast radius small, code test-covered. Human shifts from watching edits to reviewing artifacts after long autonomous sessions. Enables parallelism (worktrees) and is fundamental to autonomous SDLC / closing the loop.

**Sidebar — legacy systems & source of truth (applies to every artifact):** existing Jira / ServiceNow / requirements tools / Figma / change boards are accepted by auditors; fit around them. For **each artifact name exactly one source of truth**; others hold copy or link. Options per artifact: (a) repo is truth, legacy references commit files; (b) legacy is truth, markdown are working copies, Claude reads record at session start and writes outcome back via MCP connector in same session; (c) linkage minimum bar — artifacts note record ID, legacy records contain commit SHA (two sources of truth accepted). Both can coexist if linked or one declared authoritative.

**`CLAUDE.md`:**
- Context a new joiner needs: commands, conventions, architecture, "things Claude gets wrong". Versioned at repo root, team-maintained, reviewed like code, code-owner approved.
- Steps: `/init` → cut to day-one essentials → commit → rule: mistake made twice → correction goes in → keep under a page (stale content wastes context).
- Prereqs none; infra repo + Claude Code + one engineer who knows the codebase.
- Metrics: Leading — repeated mistakes `CLAUDE.md` should have caught (git history of corrections). Lagging — time to first merged PR for new team member.

**Skills (institutional knowledge):**
- Use for knowledge that must be applied consistently; not for things that belong in `CLAUDE.md` or a prompt. Folder with `SKILL.md` (frontmatter: name, description = when it triggers; body = what to do). Live at `.claude/skills/<name>/` or distributed org-wide via plugin.
- Steps: pick one inconsistently-enforced policy with named owner/written source → write skill (engineer, from owner's source, Claude-assisted) → place → test triggering with varied phrasings → policy change = skill change signed off by owner → engineers get it next session.
- Example (`secure-api-review`): gateway JWT on every endpoint (no anonymous outside /health); validate bodies against OpenAPI, reject unknown fields; audit event (actor, action, entity, timestamp) on state-changing endpoints; pii-tagged fields never in logs/errors; run `scripts/check-endpoints.sh` and include output.
- **A skill is advisory.** Must-hold policies need a deterministic backstop (hook or PR re-check). Skill invocations logged in session traces; owner reviews skill changes like code.
- Metrics: Leading — policy approval → skill merge time. Lagging — PR review findings citing policy (→ zero; if not, skill isn't triggering or has drifted).

**Hooks as build-time guardrails:** deterministic layer behind skills. Block edits to protected paths (generated classes, frozen packages); run formatter/linter after edits; keep credentials out of diff. Must be fast and scoped to changed file; heavy checks (full test suite) go at commit/PR. Approval-asking hooks belong in Deploy gates (human prompts during build stall all parallel sessions).

**Parallel sessions & subagents:**
- Parallel session = separate Claude Code instance in its own git worktree (`claude --worktree <name>`); sessions share nothing but the engineer. Subagent = scoped helper inside a session with own context/tool limits (`.claude/agents/*.md`: name, description of when to use, tools allowed). Examples: code simplifier, **verifier** (runs app via `make run`, exercises change + two neighboring flows, reports vs `plan.md`, fixes nothing), researcher.
- Steps: split by non-overlapping files (use plan; shared-file tasks run serially) → one worktree each → start with 2–3 sessions, ceiling = what one person can review properly → repeated jobs become subagents checked into git.
- Prereqs: `CLAUDE.md`; feedback loop helps. Infra: git; permission settings tuned to avoid approval prompts on safe commands.
- Governance: controls come from repo config (hooks, permissions) applying to all sessions; actions logged and attributed to the engineer.
- Metrics: Leading — concurrent sessions per engineer while review quality holds (OpenTelemetry), share of day steering vs waiting. Lagging — merged changes/engineer/week alongside rework rate.

### Stage 4 — Test
**Feedback loop:** every session must be able to verify its own work (tests, build, screenshot diff) and fix its own mistakes before a human sees it. Distinct from the verifier subagent (fresh-context final check, uncolored by the producing assumptions).
- Prereqs none. Infra: test suite and build each runnable with one command; for UI, browser tool or screenshot utility via MCP.
- Steps: (1) wrap checks in one non-zero-on-failure target (`make test`); (2) list commands + healthy output example in `CLAUDE.md`; (3) quantifiable done-target; (4) bug fixes: failing test first, committed, then fix without editing the test (test-file hook enforces); (5) UI: implement→screenshot→compare→adjust, 2–3 rounds normal; (6) "done" requires running tests and showing output; (7) protect the loop — hook blocking test-file edits during fix tasks (or reject test-touching diffs in review).
- `CLAUDE.md` verification block: build must say "Build succeeded"; tests all green, never skip/delete failing test; lint zero warnings; run all three before reporting complete and paste output; fix the code, not the test.
- Governance: enforced = verify-before-done + no test edits during fix (hooks). Evidence = literal toolchain output. Logged in session transcript (OTel export to observability stack) and PR check run. Approver = code owner, focused on intent/risk.
- Metrics: Leading — first-pass CI success rate for agent changes. Lagging — review time per PR; change failure rate (incident tracker).

**Continuous evals in CI:** stage-gate QA equivalent; suite runs when agent configuration (`CLAUDE.md`, skills, hooks, model, prompts) changes, plus on schedule (some teams offline on cadence instead).
- Prereqs: `CLAUDE.md`, feedback loop. Infra: CI able to run Claude Code non-interactively; API key with eval budget.
- Steps: collect 20–50 real tasks with accepted outcomes → write each as eval (prompt + checks: tests pass, lint clean, behavior unchanged, policy followed) → run non-interactively on schedule and on config changes → gate config changes on results (pass-rate drop gets reviewed) → every production incident becomes an eval owned by the incident's team.
- Live suite: retire non-discriminating cases, add cases from monitoring.
- Example workflow: triggers on PR touching `CLAUDE.md`/`.claude/**` and nightly cron; loops `evals/*.json`, runs `claude -p` with `--allowedTools "Read,Edit,Bash(make test)"` and JSON output, checks via `evals/check.sh`.
- Governance: pass-rate threshold = merge check; runs logged for comparison; config owner approves.
- Metrics: Leading — pass rate over time; time for an incident to become a permanent eval. Lagging — regressions caught in CI vs found in production.

### Stage 5 — Deploy
**AI in PR review loop:** Claude both reviews incoming PRs against org policy and addresses comments on its own PRs. Every PR gets identical review passes, findings severity-ranked; humans judge intent and risk.
- Prereqs: updated `CLAUDE.md`; skills for policies; defined subagents. Infra: Claude integration — managed Code Review (research preview, admin-enabled) or `claude-code-action` in own CI (model access via AWS Bedrock / Google Vertex / Microsoft Foundry if needed); branch protection requiring code-owner approval.
- Steps: (1) enable managed service or `claude-code-action`; (2) tech lead writes **`REVIEW.md`** at repo root: passes (bugs/logic; security/vulnerabilities; compliance vs `spec.md`, `plan.md`, design principles), what counts as Important vs Nit, what to skip; (3) tech lead sets human threshold — findings don't approve/block alone; branch protection still needs code-owner approval; optional merge gating from machine-readable severity tally in check run; (4) `@claude` on a comment → Claude addresses and pushes fix (managed service: `@claude review` requests fresh review); for Claude-opened PRs a custom slash command "babysits" PR (sweeps unresolved comments + failing checks, pushes fixes) until green and awaiting code-owner; (5) repeated finding (2nd time) → correction into `CLAUDE.md`; review also flags outdated `CLAUDE.md`; (6) monthly tune: rate findings, cap nits, exclude generated paths and CI-enforced items.
- `REVIEW.md` example: three tagged passes; Important = breaks behavior, leaks data, breaches policy; ≤5 nits then count; skip `src/gen/` and CI-enforced.
- Governance: **separation of duties** — the agent that wrote the code can't approve it; PR history is the audit record (findings, fixes, ratings, approvals); approval human via branch protection.
- Metrics: Leading — time to first review (minutes); share of review comments resolved without human touching branch. Lagging — defects/vulns caught pre-merge vs escaping to prod.

**Hooks as approval gates:** hooks can allow, ask (pause for named approver) or block; run wherever Claude acts (also e.g. block migration/infra edits without change ticket in Build, block test edits in Test).
- Steps: leadership + change mgmt + compliance list gates that must survive (change sign-off, release authorization, protected-path edits) → platform engineer expresses each as a hook script → team hooks in `.claude/settings.json`; non-negotiable ones in **managed settings** (platform/IT-owned, not user-disablable) → blocks must explain themselves (reason + route to approval).
- Example: `PreToolUse` hook matcher `Bash` runs `production-gate.sh` which blocks (exit 2, message to Claude) when command contains "deploy" and "production" and `RELEASE_APPROVAL` is unset.
- Governance: gate enforced every time for everyone; allow/block decisions logged with timestamp; gate defines what counts as approval (approved change ticket or release manager sign-off).
- Metrics: Leading — wait time per gate (OTel hook decisions with verdict + timestamp). Lagging — gate violations reaching prod before/after hooks.

**Managed-settings worked example (regulated enterprise; tailor, don't copy):** deployed via MDM/admin console, not overridable.
- `permissions.deny`: `.env*`, `./secrets/**`, `WebFetch`, `curl`, `wget`; `allow`: `git *`, `make build/test/lint`; `disableBypassPermissionsMode`; `allowManagedPermissionRulesOnly`.
- `sandbox`: enabled, `failIfUnavailable`, `allowUnsandboxedCommands:false`, network domain allowlist (internal git, npm registry), credential deny (`~/.ssh`, `~/.aws/credentials`, strip `GITHUB_TOKEN` env).
- `allowManagedHooksOnly`, `disableSideloadFlags`, `allowManagedMcpServersOnly`, `strictKnownMarketplaces` (approved plugin repo only), `requiredMinimumVersion`.
- Rationale: deny keeps secrets out of context; allow pre-approves safe inner loop (avoids prompt fatigue); sandbox closes gap tool-level deny can't (shell network egress); credentials block closes gap deny rules leave; only org-approved hooks/skills/agents/MCP servers arrive via approved marketplace; min version ensures assessed build. Every deny trades against capability — balance by repo data classification.

**CI/CD integration & deployment:**
- Claude runs non-interactively (`claude -p`) in pipeline for judgment steps (triage failed build, flaky test, changelog), sandboxed with scoped creds; deployment exposed to agent as **MCP tools** (deploy / status / rollback) scoped per environment (allowlist, not credentialed shell script); rollback is the most rehearsed path (single command, exercised regularly in staging; later invoked by Stage 6).
- Prereqs: PR review play + approval-gate hooks (gates must exist before automation accelerates through them). Infra: CI with `claude-code-action` or any runner calling `claude -p`; API or Bedrock/Foundry/Vertex; MCP servers for deploy targets; sandbox profile, no standing prod credentials.
- Steps: (1) read-only judgment steps first; (2) write steps behind gates (lint fixes, generated docs, `@claude` comment fixes) — always arrive as PR, no route to push to main; (3) sandbox: containers, network policy, short-lived scoped tokens, no prod creds by default; (4) MCP-exposed deploy tooling; (5) **tier autonomy by environment** — dev: agent deploys freely; staging: middle; prod: agent prepares, release manager authorizes, hook enforces; (6) rehearse rollback.
- Governance principle: **the agent may act up to the production gate and cannot pass it.** Branch protection (everything is a PR); prod deploy hook blocks until named release manager authorizes; each non-interactive run acts under the agent's own identity (pipeline log separates agent from triggering engineer); per-environment permission tiers.
- Metrics: Leading — share of pipeline failures triaged without paging a human. Lagging — DORA measures.

### Stage 6 — Maintain: closing the loop
- Trigger invokes Claude with no human in the invocation path (control-band breach, ticket, channel message, schedule); Claude diagnoses, acts only via gated routes, writes finding as `intent.md`, which re-enters the pipeline. Runs headless with an **independent confidence gate between stages** (deterministic check or adversarial reviewing agent) deciding continue vs escalate to human. People triage and review; they no longer start the work.
- **Prereqs:** `intent.md` (structured restart output); PR review play; hooks as action boundary; rollback path from CI/CD (used at highest autonomy tier). **Infra:** metrics store the detection script can query (Prometheus, CI API, etc.); repo read access; non-interactive Claude in CI **or** Agent SDK service receiving webhooks.
- **Steps:** (1) pick one metric with stable rolling baseline (CI test failure rate, post-deploy 5xx rate, PR cycle time); (2) write **deterministic** detection script (mean + std dev over rolling window with Western Electric or similar rules to catch drift and spikes), version-controlled, unit-tested, no model involved; (3) tiers in version-controlled config `bands.yaml`: 1σ log only; 2σ invoke Claude read-only to diagnose (restricted tools e.g. `Read,Grep,Bash(gh run view *)`); 3σ Claude may act only by opening a PR into the review gate or triggering a pre-approved runbook (e.g. `runbook:rollback-deploy`); (4) trigger layer = scheduled GitHub/GitLab workflow, webhook from monitoring stack, or in-network cron; Claude stateless (CI step, or Agent SDK service in sandboxed container); (5) agent writes diagnosis as `intent.md` (anomaly + evidence, proposed outcome, affected systems, open questions); (6) service owner/on-call triages queue — fix now, schedule, or dismiss (product-facing → product owner); dismissals tune bands; (7) shipped fix → add eval for the incident.
- **Examples:** CI failure rate 3σ → quarantine flaky test or open revert PR (review gate decides). Post-deploy 5xx 3σ with deployment in window → trigger existing rollback pipeline. PR cycle time drift → report to eng leadership (works for process metrics too).
- **Governance:** tier boundaries enforced from version-controlled config; permissions/managed settings deny prod access; invocations, findings, triage decisions logged with timestamps; service owner approves; resulting changes go through normal PR gate; runbooks pre-approved.
- **Metrics:** Leading — band breach → `intent.md` in triage queue (vs old incident→post-mortem action). Lagging — share of findings becoming merged fixes; repeat incidents of same class (should fall as evals accumulate).
- **Rule:** detection stays deterministic; Claude is invoked once a band is breached; the tier sets what it may do.

**Claude on call with Claude Tag (public beta, Slack):** Claude is a channel member under own identity; first responder on incident channels; humans in channel guide/action; channel history = audit trail. Via MCP verifies metric back at baseline and confirms in thread; writes post-mortem to version-controlled lessons file (e.g. `lessons/2026-06-checkout-cache.md`) that future investigations read. Also triages tagged tickets over MCP: small bounded fix → PR through review gate; larger → `intent.md` for Stage 1 (loop feeds itself). Example flow: human reports 5xx climb after deploy → Claude diagnoses vs deploy diff → proposes rehearsed rollback → human says "Go" → Claude rolls back, confirms band, writes post-mortem. (Human authorization precedes the rollback.)

---

## 5. Cross-cutting principles (candidate PRD tenets)

1. Every stage commits a readable artifact; next stage consumes it; chain = audit trail.
2. One declared source of truth per artifact; linkage minimum.
3. Humans own judgment decisions; gates sit at artifact acceptance (intent, spec, plan, PR, production release).
4. Advisory controls (skills, `CLAUDE.md`) must be backed by deterministic ones (hooks, branch protection, managed settings, sandbox) where policy must hold.
5. The agent may act up to the production gate and cannot pass it; separation of duties (author ≠ approver).
6. Autonomy tiered by environment and risk; rollback rehearsed before needed.
7. Detection is deterministic; model invoked after breach; tier sets permitted actions.
8. Configuration steering the agent (`CLAUDE.md`, skills, hooks) is regression-tested like code (evals), and policy changes are reviewed by policy owner.
9. Every incident → eval + lesson; mistakes made twice → `CLAUDE.md`.
10. Everything config-as-code in git; non-negotiables in managed (non-overridable) settings.
11. Agent identity separate from human identity in logs; all actions attributable.
12. Review human attention is the scarce resource; parallelism limited by review capacity.

## 6. Component inventory (what the factory must contain)

**Artifacts & templates:** `intent.md` (template skill), `spec.md`, `plan.md`, `REVIEW.md`, `CLAUDE.md`, `bands.yaml`, lessons files, evals (`evals/*.json` + `check.sh`), incident records.
**Skills (org policy):** brand, security, compliance, UX, API security (`secure-api-review`), intent template; plugin marketplace for distribution.
**Hooks:** protected-path block, post-edit format/lint, credential-in-diff block, plan/diff sync, test-file edit block during fixes, production-gate (ask/block), change-ticket gate for migrations/infra, verify-before-done.
**Subagents:** verifier, code simplifier, researcher.
**Automation/triggers:** intent-accepted → spec job (non-interactive, PR); spec-accepted → plan mode; merged PR → pipeline; config-change/nightly → eval suite; band breach → diagnose/propose; webhook/schedule/channel → Claude.
**Infra:** version-controlled intent home; VCS connector for non-engineers; CI running `claude -p`/`claude-code-action`; Agent SDK service (sandboxed container); model access (API or Bedrock/Vertex/Foundry); MCP servers (deploy/status/rollback per env, ticketing, metrics, Slack); metrics store; sandbox + network allowlist; short-lived scoped tokens; managed settings via MDM/admin console; OpenTelemetry export to observability; analytics dashboard; branch protection + code owners.
**Roles:** originator, product owner, policy owners, engineer, tech lead/architect, platform engineer, code owner, release manager, service owner/on-call, engineering leadership + change mgmt + compliance, platform/IT admin.
**Optional/Beta features referenced:** Claude Design (beta), managed Code Review (research preview), Claude Tag (public beta, Slack; Teams mentioned generally), Cowork.

## 7. Adoption order (prerequisites reconstructed)

- No prerequisites (start anywhere): Plan/intent; `CLAUDE.md`; Skills; Hooks as approval gates; Feedback loop.
- Design ← intent.md + policy skills.
- Plan mode ← spec (and `CLAUDE.md` helps).
- Parallel sessions/subagents ← `CLAUDE.md` (+ feedback loop).
- Continuous evals ← `CLAUDE.md` + feedback loop.
- PR review ← `CLAUDE.md`, skills, subagents.
- CI/CD ← PR review + approval-gate hooks.
- Closing the loop ← `intent.md`, PR review, hooks, CI/CD rollback.
- Claude Tag ← closing-loop pattern + MCP access + Slack.

## 8. Metrics catalogue (for PRD success measures)

| Play | Leading | Lagging |
|---|---|---|
| Plan | Time first conversation → committed intent | Intent survival rate; intent edits after first spec |
| Design | intent→spec commit elapsed | spec commits after first plan commit |
| Plan mode | % merging from first pass; plan approval→merge time | Rework cycles; diff-matches-plan rate |
| CLAUDE.md | Repeated-mistake corrections | Time to new joiner's first merged PR |
| Skills | Policy change → skill merge time | Review findings citing policy → 0 |
| Parallel | Concurrent sessions/engineer with quality held; steering vs waiting | Merges/engineer/week + rework rate |
| Feedback loop | First-pass CI success of agent changes | PR review time; change failure rate |
| Evals | Pass rate trend; incident→eval time | Regressions caught in CI vs prod |
| PR review | Time to first review; % comments resolved w/o human | Pre-merge defects vs escapes |
| Approval hooks | Wait time per gate | Gate violations reaching prod |
| CI/CD | % failures triaged without paging | DORA metrics |
| Closing loop | Breach → triage-queue intent time | % findings → merged fixes; repeat incidents |

Telemetry sources named: git history, PR metadata, OTel export, CI logs, incident tracker, detection-script log.

## 9. Open points / gaps to resolve in PRD (not answered by the playbook)

- Playbook is Claude-centric (Claude Code, Agent SDK, Claude Tag, Cowork); decide how much is vendor-specific vs the factory's generic abstractions.
- Confidence-gate design between headless stages is named ("deterministic check or adversarial reviewing agent") but unspecified.
- "Higher risk / regulated / critical code" classification criteria are left to the org.
- Figure 3 dependency graph missing; Figure 1 times/numbers not given.
- Teams mentioned for Tag, but only Slack named as available.
- Source-of-truth choice per artifact (repo vs Jira/Confluence/etc.) is a decision to make for our environment.
- Stage 5 text says Test-stage hooks and Build hooks overlap; hook ownership/registry model needed.

## 10. Source resources (docs the playbook points to)
code.claude.com/docs/en/: admin-setup, settings, server-managed-settings, permissions, sandboxing, hooks-guide, hooks, skills, plugin-marketplaces, managed-mcp, third-party-integrations, network-config, monitoring-usage, analytics, security. Also platform.claude.com/docs/en/manage-claude/compliance-api.
