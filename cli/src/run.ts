// What `f8 run` sends (M1 design D5, D6), kept apart from its I/O so it can be tested.

// GitHub is the only forge in Phase 0, so only owner/repo is kept, whatever the remote's form.
export function repoUrl(remote: string) {
  const m = remote.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`can't read owner/repo from origin: ${remote}`);
  return `https://github.com/${m[1]}/${m[2]}`;
}

// Follows the adapter's preamble, which names the branch and asks for a summary.
export const taskPrompt = (issue: number, runId: string) =>
  `Resolve issue #${issue} of this repo; read it with \`gh issue view ${issue}\`. ` +
  `When your work is pushed, open a draft PR from \`f8/${runId}\` with \`gh pr create --draft\`. ` +
  `Its title is the issue's title. Its body is your summary, then \`Run: ${runId}\` and \`Fixes #${issue}\`. ` +
  `End your summary with the PR's URL.`;
