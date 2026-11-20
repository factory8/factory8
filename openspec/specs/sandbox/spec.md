# sandbox Specification

## Purpose
A run's sandbox on Kubernetes: a Kata microVM started from the project image, in which the adapter runs the agent step (SBX-3, SBX-12, SBX-16).

## Requirements

### Requirement: Kata microVM from the project image
Each step of a run SHALL get its own sandbox: a pod on the Kata RuntimeClass, started from the project image, with `f8-adapter serve` as the main process on port 7070. The image SHALL hold the dev shell's packages (`project-detection`), Claude Code, git, gh, Node, the adapter and `f8-ask`.

#### Scenario: Sandbox ready
- **WHEN** a sandbox is created for a step
- **THEN** a Kata pod runs the adapter, which answers on port 7070 from inside the cluster

### Requirement: Workspace volume
Each step of a run SHALL get its own PVC, named `factory8-<runId>-<stage>` (e.g. `factory8-k3x9qa-review-1`), mounted at `/f8` and laid out as the `agent-adapter` spec says (SBX-12). A later attempt of the same step reuses its PVC. The sandbox is a plain pod; no sandbox controller is involved (SBX-1).

#### Scenario: Volume mounted
- **WHEN** the sandbox's pod starts
- **THEN** `/f8` is an NFS-backed PVC that belongs to this step only

### Requirement: Session logs outlive the sandbox
The files on a step's PVC, including the agent's session `.jsonl` files and `/f8/state`, SHALL stay on the share after the sandbox is deleted, under a directory named after the PVC, so after the run and step (AGT-11, SBX-15). Retention is not in the POC.

#### Scenario: Restore a finished step's session
- **WHEN** a run has ended and its sandboxes are deleted
- **THEN** each step's session file is on the share, and copied into `~/.claude/projects/` it resumes with `claude --resume <id>`

### Requirement: Agent runs as root
The agent CLI SHALL run as root in the VM and always skip its permission checks, so it decides on its own what to do; the VM is the boundary (BLD-6).

#### Scenario: Permission checks skipped as root
- **WHEN** a step starts in the sandbox
- **THEN** Claude Code runs with `--dangerously-skip-permissions` and `IS_SANDBOX=1` instead of refusing to run as root

### Requirement: POC credentials from a Secret
The sandbox SHALL get, as environment variables from one Kubernetes Secret: `GH_TOKEN` (a classic token with `repo` scope, because the pilot repos have different owners and a fine-grained token covers only one; it reaches every repo its user can), `ANTHROPIC_BASE_URL` (LiteLLM's in-cluster URL) and `ANTHROPIC_AUTH_TOKEN` (one static LiteLLM virtual key). This is a POC shortcut: the agent can read both and push anywhere the token allows, including `master`. Issue #1 removes them.

#### Scenario: Agent pushes
- **WHEN** the agent pushes the run branch
- **THEN** git authenticates with `GH_TOKEN` from the environment

#### Scenario: Agent opens the draft PR
- **WHEN** the agent runs `gh issue view` or `gh pr create --draft`
- **THEN** `gh` authenticates with `GH_TOKEN` from the environment

#### Scenario: Model call
- **WHEN** Claude Code calls a model
- **THEN** the request goes to LiteLLM with the static key (AGT-10, A13)
