# Tasks

Dogfooded: each task becomes a GitHub issue and runs through `f8 run <issue>`.

## 2. M2: live progress and session logs

- [ ] 2.1 Session restore (AGT-11; after 1.8). Done when: a finished step's session file, copied from its folder on the session-log volume, resumes in a terminal with `claude --resume <id>` (split-session-logs 7.1 checks this once too)
- [ ] 2.2 Step heartbeats with progress (ORC-13; after 1.8). Done when: the poll activity heartbeats the latest progress; the heartbeat timeout is `progressTimeout`
- [ ] 2.3 `f8 runs`, `f8 watch <run>` (PLT-5; after 2.2). Done when: it lists runs with their stage and latest progress, follows a run live (workflow query), and supports `--json` output
- [ ] 2.4 Progress comment on the PR (ORC-13; after 2.2). Done when: there is one status comment on the PR, edited as the run progresses
