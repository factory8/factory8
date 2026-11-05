// What `f8 run` sends (M1 design D5, D6), kept apart from its I/O so it can be tested.

// GitHub is the only forge in Phase 0, so only owner/repo is kept, whatever the remote's form.
// Lowercased: GitHub ignores case, but the repo's task queue and FACTORY8_IMAGES don't (M7 D2).
export function repoUrl(remote: string) {
  const m = remote.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`can't read owner/repo from origin: ${remote}`);
  return `https://github.com/${m[1]}/${m[2]}`.toLowerCase();
}

export type Command = { cmd: 'run'; flow: string; issue: number } | { cmd: 'answer'; run: string; text: string };

// `f8 run [--flow <name>] <issue>` and `f8 answer <run> <text>`; undefined means print the usage (M6 D13, M7 D5).
// Any flow name that makes `<name>Workflow` a valid workflow type: the repo's worker says whether it has it.
export function parseArgs(argv: string[]): Command | undefined {
  const [cmd, ...rest] = argv;
  if (cmd === 'answer') return rest.length > 1 ? { cmd, run: rest[0], text: rest.slice(1).join(' ') } : undefined;
  if (cmd !== 'run') return undefined;
  const flow = rest[0] === '--flow' ? rest.splice(0, 2)[1] : 'sdlc';
  const issue = Number(rest[0]);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(flow) || rest.length !== 1 || !Number.isInteger(issue) || issue < 1) return undefined;
  return { cmd, flow, issue };
}

// The line a run's result prints as, for every flow: its `url`, else its `summary`, else the result as JSON.
export function resultLine(result: unknown) {
  const { url, summary } = (result ?? {}) as { url?: unknown; summary?: unknown };
  return typeof url === 'string' ? url : typeof summary === 'string' ? summary : JSON.stringify(result);
}
