# deploy/worker.yaml: its header still says the sandbox tag is updated there

Issue #18. Since #16 (`origin/m7-deploy`, still open), the shared worker serves no repo: its
`FACTORY8_IMAGES` is `{}`, it runs 0 replicas, and factory8/factory8's sandbox tag lives in
`deploy/projects/factory8.yaml`. Only `deploy/worker.yaml`'s header comment still says a
`.#sandbox-image` tag is updated "here".

## Files that change

- `deploy/worker.yaml` — the header comment, line 2 only. It now reads:

  ```
  # Both image tags are Nix hashes: after `nix build .#worker-image` or `.#sandbox-image`, import the image and update its tag here.
  ```

  Replace with (wrapped like the file's other multi-line comments):

  ```
  # Image tags are Nix hashes: after `nix build .#worker-image`, import the image and update its tag here.
  # A repo's sandbox image tag (`nix build .#sandbox-image` in that repo) goes in the Deployment that serves
  # the repo — deploy/projects/factory8.yaml for this one.
  ```

  No other file: the comment is quoted nowhere else, no spec or diagram shows it, and the issue asks
  only for this comment.

## Order of work

1. Base the branch on #16's state: if #16 is still open, `git rebase origin/m7-deploy`. On master the
   current comment is true (the sandbox tag is still in `FACTORY8_IMAGES` there), so the new wording
   only reads correctly on top of #16, and this PR must not merge before it.
2. Edit line 2 as above. Leave lines 1 and 3 alone.
3. Check the file still renders (below, under Proof), commit, push, mark the PR ready.

## Risks

- **Ordering with #16** is the only real risk: merged alone, the new comment would point at
  `deploy/projects/factory8.yaml`, which master doesn't have. If #16 is reworked instead of merged,
  re-word rather than assume its file names.
- Adjacent staleness with the same cause, deliberately not touched here: CLAUDE.md/AGENTS.md say
  "after `nix build .#worker-image` or `.#sandbox-image` … put its new tag in `deploy/worker.yaml`",
  and README's FACTORY8_IMAGES bullet describes the pre-#16 mapping. File follow-up issues if wanted;
  this diff stays one comment.
- A live-manifest change that changes no parsed field: the next `kubectl apply -k deploy/` is a no-op
  for the cluster, so no deploy step and no run-in-flight constraint.

## Proof

- `git diff` (against the base) touches only lines 2–4 of `deploy/worker.yaml`, all `#` comments.
- `nix develop -c kubectl kustomize deploy/` succeeds, and its output is byte-identical before and
  after the change (kustomize drops comments) — proof the edit is comment-only and the manifest the
  cluster sees is unchanged.
- Reading the new header answers the issue: the worker's own tag here, each repo's sandbox tag in the
  Deployment that serves the repo.
