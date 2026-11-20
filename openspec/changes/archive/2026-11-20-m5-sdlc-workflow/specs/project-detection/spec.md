# Spec Delta

## MODIFIED Requirements

### Requirement: Agent profile from the installation
The agent profile (vendor, model) SHALL come from the installation: review steps use its reviewer model, and every other step its default model. The two MAY be the same model: the review step's own sandbox and empty session keep it independent (DEP-11). No per-project setting is read in Phase 0.

#### Scenario: Default model
- **WHEN** a run's plan, build or fix step starts
- **THEN** it uses the installation's default vendor and model

#### Scenario: Reviewer model
- **WHEN** a run's review step starts
- **THEN** it uses the installation's default vendor and its reviewer model, which may be the default model
