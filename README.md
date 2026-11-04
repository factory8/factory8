# Factory8

Factory8 turns a GitHub issue into a draft PR. You run `f8 run <issue>` in a clone; an agent (Claude Code) works on the issue in a Kata microVM on the cluster, pushes a branch and opens the PR. Requirements are in `docs/PRD.md`, and contributor notes are in `AGENTS.md`.

## Using f8

**Before your first run**
- Factory8 is installed on the cluster (`deploy/`, see `AGENTS.md`).
- The repo has a sandbox image, and the worker's `FACTORY8_IMAGES` in `deploy/worker.yaml` maps the repo's URL to it. Today only factory8/factory8 has one.
- You have Nix and a kubeconfig for the cluster.

**Run**
```sh
export TEMPORAL_ADDRESS=temporal-frontend.factory8.svc.cluster.local:7233   # the cluster's DNS, through Tailscale
cd <your clone>
nix run ~/code/softwory#f8 -- run 12                                        # issue #12
```
Without Tailscale, leave `TEMPORAL_ADDRESS` unset (it defaults to `localhost:7233`) and keep a port-forward open: `kubectl -n factory8 port-forward svc/temporal-frontend 7233`.

**What happens**
1. `f8` reads `owner/repo` from `origin`, picks a 6-character run ID and prints `run <id> started`.
2. The worker creates a sandbox (pod and PVC `factory8-<id>` in `factory8-sandboxes`), and the agent clones the repo on branch `factory8/<id>`.
3. The agent reads the issue with `gh`, does the work, pushes, and opens a draft PR whose body says `Fixes #12`. Its commits carry the trailer `Factory8-Run: <id>`.
4. The sandbox pod is deleted, and `f8` prints the agent's summary, which ends with the PR's URL.

A small change takes about a minute.

**Watching:** the run is the workflow `<id>` in the Temporal UI (`deploy/web.yaml`). The UI shows the sandbox and agent steps, not what the agent is doing inside them.

**When it doesn't end in a PR,** `f8` exits 1 and prints one of these:
- `failed: <reason>`: the agent or its sandbox failed. The branch may hold partial work.
- `needs_input: <question>`: the agent asked a question that only you can answer. You can't answer it in the run yet, so add the answer to the issue and run again.

**Ctrl-C** only stops `f8` waiting; the run carries on.

**Afterwards**
- **Review the PR** like any other, then mark it ready and merge it. Prefer a merge commit or rebase: a squash drops the `Factory8-Run` trailer.
- **Clean up by hand:** if you close the PR, delete its branch too. The PVC `factory8-<id>` stays on the share until you delete it (`kubectl -n factory8-sandboxes delete pvc factory8-<id>`).

**Not there yet:** follow-ups on the same run (feedback, answers), cancelling a run, live progress (`f8 watch`), Docker inside the sandbox, and images for repos other than factory8/factory8.
