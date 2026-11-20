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
  // A blank answer is no answer (#19): the text is kept as typed, only the check trims.
  if (cmd === 'answer') {
    const text = rest.slice(1).join(' ');
    return text.trim() ? { cmd, run: rest[0], text } : undefined;
  }
  if (cmd !== 'run') return undefined;
  const flow = rest[0] === '--flow' ? rest.splice(0, 2)[1] : 'sdlc';
  const issue = Number(rest[0]);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(flow) || rest.length !== 1 || !Number.isInteger(issue) || issue < 1) return undefined;
  return { cmd, flow, issue };
}

// Whether a run started, from its history (M7 D5): true once any workflow task completed, else the first failed task's
// message, such as a flow the worker doesn't have, else undefined while its first task is pending. A completion wins
// wherever it is: in a rollout, the old worker can fail the first task and the new one complete its retry.
type HistoryEvent = { workflowTaskCompletedEventAttributes?: unknown; workflowTaskFailedEventAttributes?: { failure?: { message?: string | null } | null } | null };
export function startOf(events: HistoryEvent[]): true | string | undefined {
  if (events.some(e => e.workflowTaskCompletedEventAttributes)) return true;
  const failed = events.find(e => e.workflowTaskFailedEventAttributes)?.workflowTaskFailedEventAttributes;
  return failed ? failed.failure?.message ?? 'its first workflow task failed' : undefined;
}

// The line a run's result prints as, for every flow: its `url`, else its `summary`, else the result as JSON.
export function resultLine(result: unknown) {
  const { url, summary } = (result ?? {}) as { url?: unknown; summary?: unknown };
  return typeof url === 'string' ? url : typeof summary === 'string' ? summary : JSON.stringify(result);
}
