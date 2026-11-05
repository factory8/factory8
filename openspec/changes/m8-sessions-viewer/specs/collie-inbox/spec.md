# Spec Delta

## Purpose

Brings a run that waits on a human to the engineer's phone through Collie, with a push notification and a text reply that becomes the run's answer, so autonomous runs need no one watching them.

## ADDED Requirements

### Requirement: A waiting run shows in Collie as an ask
For every open run whose `state` query has a `question`, the inbox SHALL show a pane in Collie with a text ask that holds the run ID, the waiting stage and the question, within 30 s of the question being asked. Each question SHALL raise one ask and one notification, including across inbox restarts. Runs without a `state` query, or with no question, SHALL NOT show.

#### Scenario: Question
- **WHEN** run `k3x9qa`'s design step asks "PostgreSQL or SQLite?"
- **THEN** within 30 s Collie shows a pane for `k3x9qa` with a text ask that reads `design` and the question, and pushes one notification

#### Scenario: Inbox restart
- **WHEN** the inbox restarts while `k3x9qa` still waits on the same question
- **THEN** Collie shows the same ask, and pushes no second notification

#### Scenario: Run without a question
- **WHEN** a ship run is between steps with no question
- **THEN** the inbox shows no ask for it

### Requirement: A reply in Collie answers the run
A text reply to an ask SHALL be sent to its run as the `answer` signal, unchanged, but only while that run still waits on that same question. Otherwise the reply SHALL be refused as too late, and no signal SHALL be sent.

#### Scenario: Reply
- **WHEN** the engineer replies "PostgreSQL" to `k3x9qa`'s ask
- **THEN** run `k3x9qa` receives the `answer` signal "PostgreSQL", and its step resumes

#### Scenario: Already answered
- **WHEN** the engineer answered with `f8 answer`, and then replies to the same ask in Collie before it closed
- **THEN** Collie shows the reply as too late, and the run receives no second answer

### Requirement: An ask closes when its question is gone
When a run stops waiting on an ask's question (it got an answer from any channel, it was cancelled or it ended), the inbox SHALL close that ask within 30 s. It SHALL remove the run's pane once the run no longer waits on any question.

#### Scenario: Answered elsewhere
- **WHEN** `k3x9qa`'s question is answered with `f8 answer`
- **THEN** within 30 s its ask in Collie is closed and no longer answerable

### Requirement: The ask links to the waiting step's session
The ask SHALL carry a link that opens the waiting step's session in the session viewer, so the engineer can read what led to the question before answering.

#### Scenario: Context before answering
- **WHEN** the engineer taps the link on `k3x9qa`'s ask
- **THEN** the session viewer opens the session of `k3x9qa`'s design step

### Requirement: The inbox is gated by a token
The inbox SHALL serve Collie's durable wire over HTTPS. It SHALL refuse every request that doesn't carry its token, and read and answer nothing for it.

#### Scenario: No token
- **WHEN** a request without the token, or with a wrong one, reaches the inbox
- **THEN** it answers 401, and no run is read or answered
