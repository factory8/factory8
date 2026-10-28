## MODIFIED Requirements

### Requirement: Cancel
`POST /steps/{stepId}/cancel` SHALL stop the running CLI and every process it started: the CLI runs in its own process group, which gets SIGTERM, then SIGKILL if the CLI hasn't exited within 10 s. The step then exits `failed` with reason `cancelled`. It SHALL answer `202` even when nothing is running.

#### Scenario: Cancel a running step
- **WHEN** a worker cancels a running step
- **THEN** the CLI's process group gets SIGTERM, and the step exits `failed` with reason `cancelled`

#### Scenario: Agent's child processes
- **WHEN** a step is cancelled while the agent has a command running
- **THEN** that command doesn't outlive the cancel
