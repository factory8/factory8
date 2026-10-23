# Spec Delta

## Purpose

A run executes one agent step in its own sandbox and reports how the step ended. It owns the sandbox's lifetime and talks only to Kubernetes and the adapter (ORC; Phase 0).

## ADDED Requirements

### Requirement: One-step run
A run SHALL create a sandbox, start one build step through the adapter with the task prompt it was given, and poll the step's events until its exit event. The run's result SHALL be that exit: `done` with the agent's summary, `failed` with the reason, or `needs_input` with the question.

#### Scenario: Agent finishes
- **WHEN** the step exits `done`
- **THEN** the run succeeds, and its result is the agent's summary

### Requirement: No forge actions in the run
The run SHALL NOT call the forge or hold forge credentials. Reading the issue, opening the draft PR and any other forge work are the agent's, asked for by the task prompt.

#### Scenario: Draft PR
- **WHEN** a run for an issue succeeds
- **THEN** the draft PR was opened by the agent from the sandbox, and the worker made no GitHub call

### Requirement: Run branch
Each run SHALL have its own branch `f8/<runId>`, which the step's preamble names and the agent pushes to.

#### Scenario: Branch per run
- **WHEN** two runs start on the same repo
- **THEN** each pushes to its own `f8/<runId>` branch

### Requirement: Sandbox deleted at run end
A run SHALL delete its sandbox's pod when it ends, whatever the outcome. The run's PVC stays (`sandbox` spec, "Session logs outlive the sandbox").

#### Scenario: Step fails
- **WHEN** the step exits `failed`
- **THEN** the run fails with the step's reason, and the sandbox is deleted

### Requirement: No waiting or retries
A step that exits `needs_input` SHALL fail the run, with the question as the reason; the wait comes in M3. A failed step SHALL NOT be retried; retries come in M4.

#### Scenario: Agent asks a question
- **WHEN** the step exits `needs_input`
- **THEN** the run fails with the question as its reason, and the sandbox is deleted
