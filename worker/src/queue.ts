// A repo's task queue (M7 design D2). f8 imports it too, so the CLI and the worker can't disagree.
export function taskQueue(repo: string) {
  const m = repo.match(/^https:\/\/github\.com\/([a-z0-9-]+\/[a-z0-9._-]+)$/);
  if (!m) throw new Error(`${repo} isn't a lowercase GitHub repo URL`);
  return `factory8/${m[1]}`;
}
