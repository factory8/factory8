#!/usr/bin/env node
// f8-adapter: runs one agent step at a time inside the sandbox (openspec/specs/agent-adapter/spec.md).
import { createServer } from 'node:http';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { EventBody, StepEvent, StepRequest } from './types.ts';
import { ROOT, workdir } from './workdir.ts';

interface AnswerRequest { answer: string }

const HOME = `${ROOT}/home`, STATE = `${ROOT}/state`, PLUGIN = `${ROOT}/plugin`, CLONE = `${ROOT}/.clone`;
const exec = promisify(execFile);
const git = (...args: string[]) => exec('git', ['-C', work!, ...args]);
// shortcut: the token comes from the pod's Secret (sandbox spec), remove with #1.
const cred = '!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f';
const clone = (url: string, dir: string, ...cfg: string[]) =>
  exec('git', ['clone', '-c', `credential.helper=${cred}`, ...cfg, url, dir]);

mkdirSync(STATE, { recursive: true });
mkdirSync(HOME, { recursive: true });
const read = (f: string) => existsSync(`${STATE}/${f}`) ? readFileSync(`${STATE}/${f}`, 'utf8') : undefined;
// State survives a pod restart on the same PVC (resume after suspend, retry after sandbox death).
let req: StepRequest | undefined = read('request.json') && JSON.parse(read('request.json')!);
const events: StepEvent[] = (read('events.jsonl') ?? '').split('\n').filter(Boolean).map(l => JSON.parse(l));
// The step's checkout, /f8/<owner>/<repo>, kept so a resumed session runs in the cwd it started in.
let work = read('checkout');
let child: ChildProcess | undefined;
let cancelled = false;
let wake: (() => void)[] = [];

function emit(stepId: string, body: EventBody) {
  const e = { seq: (events.at(-1)?.seq ?? 0) + 1, at: new Date().toISOString(), stepId, ...body } as StepEvent;
  events.push(e);
  appendFileSync(`${STATE}/events.jsonl`, JSON.stringify(e) + '\n');
  wake.splice(0).forEach(f => f());
}

const preamble = (r: StepRequest) => `You are working in \`${work}\` on branch \`${r.repo.branch}\`. Commit and push your work before you finish.
If you need a decision only a human can make, run \`f8-ask "<question>"\` and stop; don't guess.
Finish with a short summary of what you did.`;

async function checkout(r: StepRequest) {
  if (!work || !existsSync(`${work}/.git`)) {
    // Cloned aside first: the name can come from the default branch's .factory8/project.yaml (M8 D8).
    rmSync(CLONE, { recursive: true, force: true }); // left by a restart mid-clone
    await clone(r.repo.url, CLONE, '-c', 'user.name=Factory8', '-c', 'user.email=factory8@users.noreply.github.com');
    const yaml = `${CLONE}/.factory8/project.yaml`;
    work = workdir(r.repo.url, existsSync(yaml) ? readFileSync(yaml, 'utf8') : undefined);
    writeFileSync(`${STATE}/checkout`, work); // before the rename: a restart in between finds no .git there and clones again
    mkdirSync(dirname(work), { recursive: true });
    renameSync(CLONE, work);
  }
  await git('fetch', 'origin');
  await git('switch', r.repo.branch).catch(() => git('switch', '-c', r.repo.branch));
  writeFileSync(`${work}/.git/hooks/commit-msg`,
    `#!/bin/sh\ngit interpret-trailers --in-place --if-exists doNothing --trailer 'Factory8-Run: ${r.runId}' "$1"\n`, { mode: 0o755 });
  if (existsSync(`${work}/AGENTS.md`) && !existsSync(`${work}/CLAUDE.md`)) {
    writeFileSync(`${work}/CLAUDE.md`, '@AGENTS.md\n');
    appendFileSync(`${work}/.git/info/exclude`, '/CLAUDE.md\n');
  }
  if (r.plugin) {
    // On the PVC, so a resumed step reuses it. Pinned to the worker image's commit (M7 D9).
    if (!existsSync(`${PLUGIN}/.git`)) await clone(r.plugin.url, PLUGIN);
    const p = (...args: string[]) => exec('git', ['-C', PLUGIN, ...args]);
    await p('fetch', 'origin');
    await p('checkout', '--detach', r.plugin.ref);
  }
}

function describe(tool: { name: string; input?: Record<string, unknown> }) {
  const i = tool.input ?? {};
  const arg = i.command ?? i.file_path ?? i.pattern ?? i.url ?? i.description ?? '';
  return arg ? `${tool.name}: ${String(arg).split('\n')[0].slice(0, 200)}` : tool.name;
}

// Runs the CLI once. `fallback` runs instead when a --resume never got its session started.
function run(r: StepRequest, args: string[], prompt: string, fallback?: () => void) {
  const c = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions',
    '--model', r.profile.model, ...(r.profile.effort ? ['--effort', r.profile.effort] : []),
    // A resumed session keeps the system prompt it started with, so the flag there is a no-op (M6 D5 spike).
    '--append-system-prompt', preamble(r), ...(r.plugin ? ['--plugin-dir', `${PLUGIN}/plugin`] : []), ...args], {
    cwd: work,
    env: { ...process.env, HOME, IS_SANDBOX: '1' }, // IS_SANDBOX lets --dangerously-skip-permissions run as root
    detached: true, // its own process group, so a cancel reaches the commands it starts
  });
  child = c;
  c.stdin.end(prompt);
  let started = false, summary = '', stderr = '';
  c.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
  createInterface({ input: c.stdout }).on('line', line => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === 'system' && m.subtype === 'init') {
      started = true;
      writeFileSync(`${STATE}/session`, m.session_id);
    } else if (m.type === 'assistant') {
      for (const b of m.message?.content ?? []) if (b.type === 'tool_use') emit(r.stepId, { type: 'progress', text: describe(b) });
    } else if (m.type === 'result') {
      summary = m.result ?? '';
    }
  });
  c.on('close', code => {
    child = undefined;
    if (code !== 0 && !started && fallback && !cancelled) return fallback();
    const question = read('question.md')?.trim();
    if (cancelled) emit(r.stepId, { type: 'exit', status: 'failed', reason: 'cancelled' });
    else if (question) emit(r.stepId, { type: 'exit', status: 'needs_input', question });
    else if (code === 0) emit(r.stepId, { type: 'exit', status: 'done', summary });
    else emit(r.stepId, { type: 'exit', status: 'failed', reason: `claude exited ${code}: ${stderr.trim().split('\n').slice(-5).join('\n')}` });
  });
}

// Fresh session, or resume the recorded one (a retry on the same PVC, or an answer).
function start(r: StepRequest, resumeWith: string, extra = '') {
  const fresh = () => run(r, [], `${r.prompt}${extra}`);
  const session = read('session');
  if (session) run(r, ['--resume', session], resumeWith, fresh);
  else fresh();
}

async function body(q: AsyncIterable<Buffer>) {
  let s = '';
  for await (const c of q) s += c;
  return JSON.parse(s);
}

const server = createServer(async (q, s) => {
  const send = (code: number, payload?: unknown) => {
    s.writeHead(code, { 'content-type': 'application/json' }).end(payload === undefined ? '' : JSON.stringify(payload));
  };
  try {
    const url = new URL(q.url!, 'http://adapter');
    const m = url.pathname.match(/^\/steps(?:\/([^/]+)\/(answer|events|cancel))?$/);
    if (!m) return send(404, { error: 'not found' });
    const [, id, action] = m;

    if (!id && q.method === 'POST') {
      const r: StepRequest = await body(q);
      if (!r.stepId || !r.runId || !r.prompt || !r.repo?.url || !r.repo?.branch || !r.profile?.model) {
        return send(400, { error: 'incomplete StepRequest' });
      }
      if (req?.stepId === r.stepId) return send(202);
      if (child) return send(409, { error: `step ${req?.stepId} is running` });
      req = r;
      cancelled = false;
      writeFileSync(`${STATE}/request.json`, JSON.stringify(r));
      send(202);
      try {
        await checkout(r);
      } catch (e) {
        return emit(r.stepId, { type: 'exit', status: 'failed', reason: `checkout failed: ${e}` });
      }
      return start(r, 'continue');
    }

    if (!id || !events.some(e => e.stepId === id) && req?.stepId !== id) return send(404, { error: 'unknown step' });

    if (action === 'events' && q.method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0);
      const mine = () => events.filter(e => e.stepId === id && e.seq > after);
      if (!mine().length) await new Promise<void>(res => { wake.push(res); setTimeout(res, 30_000); });
      return send(200, { events: mine() });
    }

    if (action === 'answer' && q.method === 'POST') {
      const a: AnswerRequest = await body(q);
      if (child) return send(202); // already resumed
      const last = events.findLast(e => e.stepId === id);
      if (last?.type !== 'exit' || last.status !== 'needs_input') return send(409, { error: 'step is not waiting for an answer' });
      rmSync(`${STATE}/question.md`, { force: true });
      send(202);
      const handoff = read('handoff.md') ?? '(none)';
      return start(req!, a.answer,
        `\n\n## Earlier work on this step\n\nHandoff note:\n\n${handoff}\n\nYou asked: ${last.question}\n\nThe answer: ${a.answer}`);
    }

    if (action === 'cancel' && q.method === 'POST') {
      if (child && req?.stepId === id) {
        const c = child;
        const kill = (sig: NodeJS.Signals) => { try { process.kill(-c.pid!, sig); } catch {} }; // the group may be gone before `close`
        cancelled = true;
        kill('SIGTERM');
        setTimeout(() => { if (child === c) kill('SIGKILL'); }, 10_000).unref();
      }
      return send(202);
    }

    send(405, { error: 'method not allowed' });
  } catch (e) {
    send(500, { error: String(e) });
  }
});

if (process.argv[2] !== 'serve') {
  console.error('usage: f8-adapter serve');
  process.exit(2);
}
server.listen(Number(process.env.PORT ?? 7070));
