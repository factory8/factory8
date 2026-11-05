# Spec Delta

## ADDED Requirements

### Requirement: A question takes one answer
The run SHALL take only the first `answer` signal for the question it waits on. It SHALL drop an `answer` that arrives while no question waits, or after the waiting question already received one, so that an answer is never applied to a later question.

#### Scenario: Two channels answer
- **WHEN** the run waits on a question and receives two `answer` signals, one from `f8 answer` and one from Collie
- **THEN** the step resumes with the first answer, and the second is dropped

#### Scenario: Answer with no question
- **WHEN** the run receives an `answer` while no question waits, and later asks a question
- **THEN** the run waits for a new answer to that question
