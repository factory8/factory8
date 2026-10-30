// What `f8 run` sends (M1 design D5, D6), kept apart from its I/O so it can be tested.

// GitHub is the only forge in Phase 0, so only owner/repo is kept, whatever the remote's form.
export function repoUrl(remote: string) {
  const m = remote.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`can't read owner/repo from origin: ${remote}`);
  return `https://github.com/${m[1]}/${m[2]}`;
}
