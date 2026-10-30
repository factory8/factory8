// What `f8 run` sends (M1 design D5, D6), kept apart from its I/O so it can be tested.

// GitHub is the only forge in Phase 0, so only owner/repo is kept, whatever the remote's form.
export function repoUrl(remote: string) {
  const m = remote.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`can't read owner/repo from origin: ${remote}`);
  return `https://github.com/${m[1]}/${m[2]}`;
}

export type Command = { cmd: 'run'; flow: 'sdlc' | 'ship'; issue: number } | { cmd: 'answer'; run: string; text: string };

// `f8 run [--flow ship] <issue>` and `f8 answer <run> <text>`; undefined means print the usage (M6 design D13).
export function parseArgs(argv: string[]): Command | undefined {
  const [cmd, ...rest] = argv;
  if (cmd === 'answer') return rest.length > 1 ? { cmd, run: rest[0], text: rest.slice(1).join(' ') } : undefined;
  if (cmd !== 'run') return undefined;
  const flow = rest[0] === '--flow' ? rest.splice(0, 2)[1] : 'sdlc';
  const issue = Number(rest[0]);
  if ((flow !== 'sdlc' && flow !== 'ship') || rest.length !== 1 || !Number.isInteger(issue) || issue < 1) return undefined;
  return { cmd, flow, issue };
}
