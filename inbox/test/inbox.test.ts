import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { createCore, HttpError } from '@colliepwa/durable-sdk';
import type { RunState } from '../../worker/src/flow.ts';
import { askId, gated, link, seeded, sink, waiting } from '../src/inbox.ts';

const asking: RunState = { stage: 'design', question: 'PostgreSQL or SQLite?', steps: [] };

test('only a run whose state has a question waits', () => {
  assert.deepEqual(waiting([
    { runId: 'k3x9qa', state: asking },
    { runId: 'sdlc01' }, // no `state` query
    { runId: 'b7m2pz', state: { stage: 'implement-1', steps: [] } },
  ]), [{ runId: 'k3x9qa', stage: 'design', question: 'PostgreSQL or SQLite?', askId: askId('k3x9qa', 'design', 'PostgreSQL or SQLite?') }]);
});

test('an ask id stays for the same run, stage and question, and changes with any of them', () => {
  const id = askId('k3x9qa', 'design', 'PostgreSQL or SQLite?');
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(askId('k3x9qa', 'design', 'PostgreSQL or SQLite?'), id);
  for (const other of [askId('k3x9qa', 'design', 'Which port?'), askId('k3x9qa', 'review-1', 'PostgreSQL or SQLite?'), askId('b7m2pz', 'design', 'PostgreSQL or SQLite?')])
    assert.notEqual(other, id);
});

test('the link opens the step\'s session, by the ID in its state folder', () => {
  const dir = mkdtempSync(`${tmpdir()}/inbox-`);
  mkdirSync(`${dir}/k3x9qa-design/state`, { recursive: true });
  writeFileSync(`${dir}/k3x9qa-design/state/session`, '0c6f3a2e-5b1d-4f7a-9e2c-8d4b6a1f3e5c\n');
  assert.equal(link('https://factory8-sessions.libre.pod', dir, 'k3x9qa', 'design'),
    'https://factory8-sessions.libre.pod/sessions/0c6f3a2e-5b1d-4f7a-9e2c-8d4b6a1f3e5c');
  assert.equal(link('https://v', dir, 'k3x9qa', 'review-1'), undefined, 'no session yet');
  mkdirSync(`${dir}/k3x9qa-review-1/state`, { recursive: true });
  writeFileSync(`${dir}/k3x9qa-review-1/state/session`, 'x) [tap me](https://evil');
  assert.equal(link('https://v', dir, 'k3x9qa', 'review-1'), undefined, 'not an ID');
});

test('the ask is a text ask the SDK takes, and a long question is cut so the link still ends it', () => {
  const w = waiting([{ runId: 'k3x9qa', state: { ...asking, question: 'é'.repeat(3000) } }])[0];
  const r = seeded(w, 'https://v/sessions/abc');
  assert.equal(r.ask.title, 'k3x9qa · design');
  assert.ok(r.ask.reason!.endsWith('…\n\nhttps://v/sessions/abc'));
  assert.ok(Buffer.byteLength(r.ask.reason!) <= 2048);
  const pane = createCore({ hostName: 't', allowAlways: false }).workspace('w', { title: 'W' }).tab('t', { title: 'T' }).pane('k3x9qa', { title: 'k3x9qa', harness: 'factory8' });
  pane.seedAsk(r, { answer: () => ({ taken: true }) });
  assert.deepEqual(pane.openAsks.map(a => [a.id, a.kind, a.maxLength]), [[w.askId, 'text', 2000]]);
  assert.equal(seeded(w).ask.reason, 'é'.repeat(3000).slice(0, 1022) + '…', 'no link: the question alone, cut');
});

// A sink for run k3x9qa whose state is `state`, recording what it queried and signalled.
function fake(state: RunState | undefined) {
  const calls = { queried: 0, signals: [] as [string, string][] };
  const s = sink('k3x9qa', async () => { calls.queried++; return state; }, async (run, text) => { calls.signals.push([run, text]); });
  return { s, calls };
}
const id = askId('k3x9qa', 'design', 'PostgreSQL or SQLite?');

test('a reply answers the run while it still waits on that question', async () => {
  const { s, calls } = fake(asking);
  assert.deepEqual(await s.answer(id, 1, { text: 'PostgreSQL' }, 'r1'), { taken: true });
  assert.deepEqual(calls.signals, [['k3x9qa', 'PostgreSQL']]);
});

test('a reply is too late, with no signal, once the run moved on or ended', async () => {
  for (const state of [{ ...asking, question: 'Which port?' }, { stage: 'design', steps: [] }, undefined]) {
    const { s, calls } = fake(state);
    assert.deepEqual(await s.answer(id, 1, { text: 'PostgreSQL' }, 'r1'), { taken: false, tooLate: true });
    assert.deepEqual(calls.signals, []);
  }
});

test('a blank reply is refused before the state is read, and nothing is signalled', async () => {
  const { s, calls } = fake(asking);
  await assert.rejects(async () => s.answer(id, 1, { text: ' \t ' }, 'r1'), (e: HttpError) => e.status === 400 && e.code === 'bad-body');
  assert.deepEqual(calls, { queried: 0, signals: [] });
});

test('the inbox answers 401 without the token, and serves the wire with it', async () => {
  const server = createServer(gated('s3cret', (_req, res) => res.end('wire'))).listen(0);
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/session/v1/hello`;
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: 's3cret' }, { authorization: 'Bearer s3cret2' }] as Record<string, string>[])
      assert.equal((await fetch(url, { headers })).status, 401, JSON.stringify(headers));
    const ok = await fetch(url, { headers: { authorization: 'Bearer s3cret' } });
    assert.equal(await ok.text(), 'wire');
  } finally {
    server.close();
  }
});
