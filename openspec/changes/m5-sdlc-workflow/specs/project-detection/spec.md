# Spec Delta

## MODIFIED Requirements

### Requirement: Agent profile from the installation
The agent profile (vendor, model) SHALL come from the installation: review steps use its reviewer model, and every other step its default model. The two models SHALL differ, so the reviewer never runs on the author's model (DEP-11). No per-project setting is read in Phase 0.

#### Scenario: Default model
- **WHEN** a run's plan, build or fix step starts
- **THEN** it uses the installation's default vendor and model

#### Scenario: Reviewer model
- **WHEN** a run's review step starts
- **THEN** it uses the installation's default vendor and its reviewer model, which isn't the default model
