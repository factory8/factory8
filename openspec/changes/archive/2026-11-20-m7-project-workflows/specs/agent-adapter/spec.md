# Spec Delta

## MODIFIED Requirements

### Requirement: Plugin as of a point in time
When a `StepRequest` names a plugin, the adapter SHALL, before the CLI starts:
1. clone the plugin's repo into `/f8/plugin`, or fetch it if it's already there;
2. check out the commit the request's `ref` names;
3. load that checkout's `plugin/` directory into the CLI.

Git authenticates as it does for the run branch. If any of this fails, the step SHALL exit `failed` with the git error.

#### Scenario: Pinned to a commit
- **WHEN** a commit lands on the plugin repo's default branch after the request's `ref`
- **THEN** the step loads `ref`, not the later commit

#### Scenario: Unknown ref
- **WHEN** the plugin repo has no commit named by `ref`
- **THEN** the step exits `failed` with git's error

#### Scenario: No plugin
- **WHEN** a `StepRequest` has no `plugin`
- **THEN** nothing is cloned into `/f8/plugin`, and the CLI runs without `--plugin-dir`
