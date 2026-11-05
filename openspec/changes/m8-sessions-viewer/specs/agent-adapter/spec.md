# Spec Delta

## MODIFIED Requirements

### Requirement: Checkout of the run branch
Before the CLI starts, the adapter SHALL clone or fetch the repo into its checkout, `/f8/<owner>/<repo>`. `<owner>/<repo>` is the `workdir` value in `.factory8/project.yaml` on the repo's default branch when that file sets one, and otherwise the last two path segments of the repo URL, without a trailing `.git`. Each of the two segments SHALL start with a letter, a digit or `_` and hold only letters, digits, `.`, `_` and `-`, and the owner SHALL NOT be `home`, `state` or `plugin`. A step whose name breaks these rules SHALL exit `failed` before the CLI starts. A step resumed after a pod restart SHALL keep the checkout it started with. The adapter SHALL then switch to the run branch (creating it if new) and install a `commit-msg` hook that adds the trailer `Factory8-Run: <runId>` (ART-3). Git authenticates with `GH_TOKEN` from the environment.

#### Scenario: Checkout path
- **WHEN** a step starts on `https://github.com/librepod/marketplace.git`, which sets no `workdir`
- **THEN** the checkout is `/f8/librepod/marketplace`, and the CLI runs there

#### Scenario: Pinned by the repo
- **WHEN** a step starts on `https://gitlab.example.com/platform/team/shop.git`, whose default branch has `.factory8/project.yaml` with `workdir: acme/shop`
- **THEN** the checkout is `/f8/acme/shop`

#### Scenario: Owner refused
- **WHEN** a step starts on `https://github.com/home/dotfiles`, which sets no `workdir`
- **THEN** the step exits `failed` before the CLI starts, with a reason that names `home/dotfiles` and says to set `workdir` in `.factory8/project.yaml`

#### Scenario: Bad workdir
- **WHEN** a repo's `.factory8/project.yaml` sets `workdir: ../etc`
- **THEN** the step exits `failed` before the CLI starts, with a reason that names `../etc`

#### Scenario: Pod restart
- **WHEN** the sandbox pod restarts during a step
- **THEN** the adapter works in the same checkout, without cloning again

#### Scenario: Agent commits
- **WHEN** the agent commits on the run branch
- **THEN** the commit message ends with `Factory8-Run: <runId>`

#### Scenario: Checkout fails
- **WHEN** the clone, fetch or switch fails
- **THEN** the step exits `failed` with the git error as its reason

### Requirement: AGENTS.md as Claude Code context
If the checkout has `AGENTS.md` but no `CLAUDE.md`, the adapter SHALL write `CLAUDE.md` in the checkout containing `@AGENTS.md` and list it in `.git/info/exclude`, so it is never committed (AGT-4).

#### Scenario: Repo with AGENTS.md only
- **WHEN** a step starts on a repo that has `AGENTS.md` and no `CLAUDE.md`
- **THEN** Claude Code loads `AGENTS.md` through the generated `CLAUDE.md`, and `git status` shows no new file

### Requirement: Headless CLI run
The adapter SHALL run `claude -p --output-format stream-json --verbose --dangerously-skip-permissions --model <model>` in the checkout, with `HOME=/f8/home` and `IS_SANDBOX=1`. It adds:
- `--effort` when the profile has one;
- `--append-system-prompt` with the protocol preamble;
- `--plugin-dir` when the step loads a plugin.

Permission checks are always skipped: the agent is root in the sandbox, which is the boundary (BLD-6). The task prompt alone goes on stdin, so it can start with a slash command.

#### Scenario: Fresh session
- **WHEN** a step starts and no session is recorded
- **THEN** stdin holds the task prompt alone, and the preamble is appended to the system prompt

#### Scenario: Slash command
- **WHEN** a step's prompt is `/factory8:review 12 mode=code pr=18 sha=abc123` and it loads the plugin
- **THEN** Claude Code runs the plugin's `review` skill with those arguments

#### Scenario: Session filed under the repo
- **WHEN** a step runs on factory8/factory8
- **THEN** its session file is under `/f8/home/.claude/projects/-f8-factory8-factory8/`

### Requirement: Protocol preamble
Every session's system prompt, fresh or resumed, SHALL end with: "You are working in `<checkout>` on branch `<branch>`. Commit and push your work before you finish. If you need a decision only a human can make, run `f8-ask "<question>"` and stop; don't guess. Finish with a short summary of what you did."

#### Scenario: Branch named
- **WHEN** a step starts on branch `factory8/abc123`
- **THEN** the preamble names `factory8/abc123` as the branch to push

#### Scenario: Checkout named
- **WHEN** a step starts on `https://github.com/factory8/factory8`
- **THEN** the preamble names `/f8/factory8/factory8` as the place it works in

### Requirement: Filesystem layout
The PVC SHALL be mounted at `/f8` (SBX-12):
- `/f8/<owner>/<repo>` holds the checkout, and `/f8/.clone` holds a fresh clone until its checkout path is known;
- `/f8/home` is the CLI's `$HOME`;
- `/f8/state` holds `request.json`, `events.jsonl`, `session`, `checkout`, `question.md` and `handoff.md`;
- `/f8/plugin` holds the plugin's checkout.

The vendor session files (`/f8/home/.claude/projects`) and `/f8/state` are the step's session logs. They stay on the PVC and are not uploaded (AGT-11). Nothing secret is written under `/f8`.

#### Scenario: Secrets stay in the environment
- **WHEN** a step runs with the POC Secret
- **THEN** the token and key reach git and the CLI only as environment variables, and no file under `/f8` holds them

#### Scenario: Step exits
- **WHEN** a step exits with any status
- **THEN** its session `.jsonl` and `/f8/state` are on the PVC, and nothing is sent anywhere
