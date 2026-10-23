# Always skip Claude Code's permission checks

## Why

The user decided on 2026-10-23 that Claude Code in the sandbox always runs with `--dangerously-skip-permissions`: it's root in a microVM, so it decides on its own what needs doing (BLD-6). The adapter used `--permission-mode bypassPermissions`, which is the same mode under another name; the flag states the intent plainly and is what Claude Code's own help recommends for sandboxes.

## What Changes

- The adapter runs `claude` with `--dangerously-skip-permissions` instead of `--permission-mode bypassPermissions`. `IS_SANDBOX=1` stays, so the flag runs as root.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `agent-adapter`: the headless run uses `--dangerously-skip-permissions`.

## Impact

- `adapter/src/main.ts`. No callers change.
