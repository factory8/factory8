import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
case "$prompt" in *SLOW*) sleep 300 >/dev/null 2>&1 & echo $! > "$F8_ROOT/sleep.pid"; wait; exit 0;; esac
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git commit -m work"}}]}}'
echo x > f && git add f && git commit -qm work && git push -q origin HEAD
echo '{"type":"result","result":"did it"}'
`, { mode: 0o755 });

const adapters: ChildProcess[] = [];
after(() => { adapters.forEach(a => a.kill()); });

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
  return { post, untilExit, root };
}

const step = (runId: string, prompt: string) => ({
  stepId: `${runId}.build.1`, runId, prompt,
  profile: { vendor: 'claude-code', model: 'haiku' },
  repo: { url: `${tmp}/origin.git`, branch: `f8/${runId}` },
});

test('a step runs and pushes with the run trailer', async () => {
  const a = await adapter(17071);
  assert.equal(await a.post('/steps', step('run1', 'do the work')), 202);
  const events = await a.untilExit('run1.build.1');
  assert.deepEqual(events.map(e => [e.type, e.text ?? e.status]), [['progress', 'Bash: git commit -m work'], ['exit', 'done']]);
  assert.equal(events[1].summary, 'did it');
  assert.match(sh('git --git-dir origin.git log -1 --format=%B f8/run1'), /^Factory8-Run: run1$/m);
  assert.equal(await a.post('/steps', step('run1', 'do the work')), 202, 'repeated start is a no-op');
});

test('a question exits needs_input and the answer resumes the session', async () => {
  const a = await adapter(17072);
  await a.post('/steps', step('run2', 'ASK first'));
  const [asked] = await a.untilExit('run2.build.1');
  assert.deepEqual([asked.status, asked.question], ['needs_input', 'Which DB?']);
  assert.equal(await a.post('/steps/run2.build.1/answer', { answer: 'Postgres' }), 202);
  const [done] = await a.untilExit('run2.build.1', asked.seq);
  assert.deepEqual([done.status, done.summary], ['done', 'resumed with Postgres']);
});

test('cancel stops the agent and the commands it started', async () => {
  const a = await adapter(17073);
  await a.post('/steps', step('run3', 'SLOW work'));
  while (!existsSync(`${a.root}/sleep.pid`)) await new Promise(r => setTimeout(r, 50));
  const pid = Number(readFileSync(`${a.root}/sleep.pid`, 'utf8'));
  assert.equal(await a.post('/steps/run3.build.1/cancel', {}), 202);
  const [exit] = await a.untilExit('run3.build.1');
  assert.deepEqual([exit.status, exit.reason], ['failed', 'cancelled']);
  const alive = () => { try { return process.kill(pid, 0); } catch { return false; } };
  for (let i = 0; i < 20 && alive(); i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(alive(), false, 'the agent\'s child outlived the cancel');
});
