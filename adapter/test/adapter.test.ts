import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'f8-adapter-'));
const sh = (cmd: string) => execFileSync('sh', ['-c', cmd], { cwd: tmp, encoding: 'utf8' });
sh('git init -q -b master seed && git -C seed -c user.name=t -c user.email=t@t commit -q --allow-empty -m init && git clone -q --bare seed origin.git');

// Stands in for Claude Code: same flags, prompt on stdin, stream-json out.
mkdirSync(`${tmp}/bin`);
writeFileSync(`${tmp}/bin/claude`, `#!/bin/sh
prompt=$(cat)
echo '{"type":"system","subtype":"init","session_id":"s1"}'
case "$*" in *--resume*) printf '{"type":"result","result":"resumed with %s"}\\n' "$prompt"; exit 0;; esac
case "$prompt" in *ASK*) f8-ask "Which DB?" >/dev/null; exit 0;; esac
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git commit -m work"}}]}}'
echo x > f && git add f && git commit -qm work && git push -q origin HEAD
echo '{"type":"result","result":"did it"}'
`, { mode: 0o755 });

const uploads = new Map<string, number>();
const logs = createServer(async (q, s) => {
  let n = 0;
  for await (const c of q) n += c.length;
  uploads.set(q.url!, n);
  s.end();
}).listen(17079);

const adapters: ChildProcess[] = [];
after(() => { adapters.forEach(a => a.kill()); logs.close(); });

async function adapter(port: number) {
  const root = mkdtempSync(join(tmp, 'f8-'));
  adapters.push(spawn(process.execPath, [join(import.meta.dirname, '../src/main.ts'), 'serve'], {
    env: { ...process.env, F8_ROOT: root, PORT: String(port), PATH: `${tmp}/bin:${join(import.meta.dirname, '../bin')}:${process.env.PATH}` },
    stdio: 'inherit',
  }));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.status);
  // Polls like the worker does, until the next exit event.
  async function untilExit(stepId: string, after = 0) {
    const seen = [];
    for (;;) {
      const { events } = await (await fetch(`${base}/steps/${stepId}/events?after=${after}`)).json();
      seen.push(...events);
      after = seen.at(-1)?.seq ?? after;
      if (seen.at(-1)?.type === 'exit') return seen;
    }
  }
  return { post, untilExit };
}

const step = (runId: string, prompt: string) => ({
  stepId: `${runId}.build.1`, runId, prompt,
  profile: { vendor: 'claude-code', model: 'haiku' },
  repo: { url: `${tmp}/origin.git`, branch: `f8/${runId}` },
  logsUploadUrl: `http://localhost:17079/logs/${runId}.1`,
});

test('a step runs, pushes with the run trailer, and uploads its logs', async () => {
  const a = await adapter(17071);
  assert.equal(await a.post('/steps', step('run1', 'do the work')), 202);
  const events = await a.untilExit('run1.build.1');
  assert.deepEqual(events.map(e => [e.type, e.text ?? e.status]), [['progress', 'Bash: git commit -m work'], ['exit', 'done']]);
  assert.equal(events[1].summary, 'did it');
  assert.match(sh('git --git-dir origin.git log -1 --format=%B f8/run1'), /^Factory8-Run: run1$/m);
  assert.ok(uploads.get('/logs/run1.1')! > 0);
  assert.equal(await a.post('/steps', step('run1', 'do the work')), 202, 'repeated start is a no-op');
});

test('a question exits needs_input and the answer resumes the session', async () => {
  const a = await adapter(17072);
  await a.post('/steps', step('run2', 'ASK first'));
  const [asked] = await a.untilExit('run2.build.1');
  assert.deepEqual([asked.status, asked.question], ['needs_input', 'Which DB?']);
  assert.equal(await a.post('/steps/run2.build.1/answer', { answer: 'Postgres', logsUploadUrl: 'http://localhost:17079/logs/run2.2' }), 202);
  const [done] = await a.untilExit('run2.build.1', asked.seq);
  assert.deepEqual([done.status, done.summary], ['done', 'resumed with Postgres']);
  assert.ok(uploads.get('/logs/run2.2')! > 0);
});
