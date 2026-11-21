# Spec Delta

## Purpose

Lets an engineer read every agent session Factory8 keeps (AGT-11): how the agent reasoned, which tools it called and what came back, so they can tune skills and workflows and audit runs, from a desktop or phone browser.

## ADDED Requirements

### Requirement: The viewer shows every step's session from the session-log volume
The viewer SHALL list the Claude Code sessions in every step's folder of the session-log volume, `factory8-sessions` (`sandbox` spec), finished or still being written. It SHALL read them where they are, read-only. It SHALL NOT copy, upload or change them. A step created after the viewer started SHALL appear without a restart or redeploy.

#### Scenario: Finished run
- **WHEN** run `k3x9qa` finished, its steps' PVCs are deleted, and their folders `k3x9qa-design` and `k3x9qa-implement-1` are on the session-log volume
- **THEN** the viewer lists both steps' sessions

#### Scenario: New step
- **WHEN** a step starts after the viewer started
- **THEN** its session is listed within a minute, without a restart

#### Scenario: Read-only
- **WHEN** someone uses every page and action the viewer offers
- **THEN** no file on the session-log volume is created, changed or deleted

### Requirement: Sessions are grouped by repo and labelled by run and stage
The viewer SHALL list each session under the repo its step worked on (`<owner>/<repo>`, from the checkout path), and SHALL show the run ID and the stage of its step, so a session can be found from a repo and a run ID.

#### Scenario: Grouped by repo
- **WHEN** runs on factory8/factory8 and librepod/marketplace are kept on the session-log volume
- **THEN** the viewer lists their sessions under two projects, one per repo

#### Scenario: Label
- **WHEN** the viewer lists the session of ship run `k3x9qa`'s `review-1` step
- **THEN** the entry shows `k3x9qa` and `review`

### Requirement: A session shows reasoning, tools and subagents
For a session, the viewer SHALL show, in order: the prompts, the agent's messages, its thinking blocks, each tool call with its input and result, and the transcripts of subagents it started.

#### Scenario: Audit a step
- **WHEN** the engineer opens a design step's session
- **THEN** they can read its thinking, and every tool call with what the call returned

### Requirement: A step still running shows its latest turns on reload
For a step that is still running, a reload of its session SHALL show the turns written up to the reload.

#### Scenario: Stuck step
- **WHEN** a step has run for an hour with no progress, and the engineer reloads its session
- **THEN** they see the agent's latest turns

### Requirement: The viewer is reached by one URL behind the installation's sign-in
The viewer SHALL be served at one HTTPS URL, from the cluster's network and the tailnet, behind the installation's single sign-on. A request that hasn't signed in SHALL be sent to the sign-in and get no session content. The viewer's API SHALL also refuse any call without the viewer's token, so a call that skips the sign-in gets nothing. It SHALL be usable at phone width. Each session SHALL have a link that opens it.

#### Scenario: Not signed in
- **WHEN** a browser that hasn't signed in opens the viewer or a session's link
- **THEN** it is sent to the sign-in, and no session content is returned

#### Scenario: No token
- **WHEN** a call reaches the viewer's Service directly, without the token
- **THEN** it is refused, and no session content is returned

#### Scenario: Phone
- **WHEN** the engineer opens a session's link on a phone that is signed in
- **THEN** the session reads at phone width, with no sideways scrolling of the page

### Requirement: The viewer never runs an agent
The viewer SHALL NOT start, resume, fork or message an agent session, and SHALL hold no model or forge credentials. Its pod SHALL hold no agent CLI.

#### Scenario: Resume
- **WHEN** the engineer wants to continue a session
- **THEN** the viewer at most offers the `claude --resume <id>` command to copy, and starts nothing
