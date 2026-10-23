## MODIFIED Requirements

### Requirement: Headless CLI run
The adapter SHALL run `claude -p --output-format stream-json --verbose --dangerously-skip-permissions --model <model>` (plus `--effort` when given) in `/f8/work`, with `HOME=/f8/home` and `IS_SANDBOX=1`. Permission checks are always skipped: the agent is root in the sandbox and decides on its own what to do, since the sandbox is the boundary (BLD-6). The prompt goes on stdin: the protocol preamble, then the task prompt.

#### Scenario: Fresh session
- **WHEN** a step starts and no session is recorded
- **THEN** stdin holds the preamble and then the task prompt
