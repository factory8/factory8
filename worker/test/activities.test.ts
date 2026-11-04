import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { answerStep, sandboxPod, shipConfig, startStep } from '../src/activities.ts';

test('sandboxPod names the pod and its PVC claim per step, with the factory8/step label', () => {
  const pod = sandboxPod('k3x9qa', 'review-3', 'factory8-image-tag');
  assert.equal(pod.metadata?.name, 'factory8-k3x9qa-review-3');
  assert.deepEqual(pod.metadata?.labels, { app: 'factory8-sandbox', 'factory8/run': 'k3x9qa', 'factory8/step': 'review-3' });
  assert.equal(pod.spec?.volumes?.[0]?.persistentVolumeClaim?.claimName, 'factory8-k3x9qa-review-3');
});

test('startStep sends FACTORY8_REVIEW_MODEL for the reviewer and FACTORY8_MODEL otherwise', async () => {
  const realFetch = globalThis.fetch, realModel = process.env.FACTORY8_MODEL, realReview = process.env.FACTORY8_REVIEW_MODEL;
  const sent: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(init!.body!));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  process.env.FACTORY8_MODEL = 'glm-5.3';
  process.env.FACTORY8_REVIEW_MODEL = 'glm-5.3-flash';
  const r = { stepId: 'k3x9qa.build.1', runId: 'k3x9qa', prompt: 'p', repo: { url: 'https://github.com/o/r', branch: 'factory8/k3x9qa' } };
  try {
    await startStep('10.0.0.7', r, 'author');
    await startStep('10.0.0.7', { ...r, stepId: 'k3x9qa.review-1.1' }, 'reviewer');
  } finally {
    globalThis.fetch = realFetch;
    if (realModel === undefined) delete process.env.FACTORY8_MODEL; else process.env.FACTORY8_MODEL = realModel;
    if (realReview === undefined) delete process.env.FACTORY8_REVIEW_MODEL; else process.env.FACTORY8_REVIEW_MODEL = realReview;
  }
  assert.deepEqual(sent.map(s => (s as { profile: unknown }).profile), [
    { vendor: 'claude-code', model: 'glm-5.3' },
    { vendor: 'claude-code', model: 'glm-5.3-flash' },
  ]);
});

test('the worker exits at start when FACTORY8_REVIEW_MODEL is missing', () => {
  const env = { ...process.env };
  delete env.FACTORY8_REVIEW_MODEL;
  const p = spawnSync('node', [new URL('../src/main.ts', import.meta.url).pathname],{ env, encoding: 'utf8' });
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /FACTORY8_REVIEW_MODEL/);
});

const withEnv = async <T>(env: Record<string, string | undefined>, f: () => Promise<T>) => {
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try { return await f(); } finally {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};
const bands = { design: { model: 'a' }, acceptance: { model: 'a', effort: 'high' }, implement: [{ model: 'b' }, { model: 'a' }],
  review: { model: 'r' }, diagnose: { model: 'r' }, finish: { model: 'b' } };

test('shipConfig returns the bands and the plugin URL, also with one model for every stage (DEP-11)', async () => {
  const one = { ...bands, review: { model: 'a' }, diagnose: { model: 'a' } };
  for (const b of [bands, one]) {
    const c = await withEnv({ FACTORY8_BANDS: JSON.stringify(b), FACTORY8_PLUGIN: 'https://github.com/o/p' }, shipConfig);
    assert.deepEqual(c, { bands: b, plugin: 'https://github.com/o/p' });
  }
});

test('shipConfig fails with bad_bands on a missing key or an empty implement', async () => {
  const cases = [
    { ...bands, finish: undefined }, { ...bands, implement: [] }, { ...bands, review: { model: '' } },
  ];
  for (const c of cases)
    await assert.rejects(withEnv({ FACTORY8_BANDS: JSON.stringify(c), FACTORY8_PLUGIN: 'u' }, shipConfig),
      (e: Error & { type?: string; nonRetryable?: boolean }) => e.type === 'bad_bands' && e.nonRetryable === true);
  await assert.rejects(withEnv({ FACTORY8_BANDS: undefined, FACTORY8_PLUGIN: 'u' }, shipConfig), /bad_bands|bad FACTORY8_BANDS/);
});

test('startStep keeps a request\'s profile, and answerStep POSTs the answer', async () => {
  const realFetch = globalThis.fetch;
  const sent: [string, unknown][] = [];
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    sent.push([url, JSON.parse(init!.body!)]);
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  try {
    const r = { stepId: 's', runId: 'k3x9qa', prompt: 'p', repo: { url: 'u', branch: 'b' }, profile: { model: 'm', effort: 'high' } };
    await startStep('10.0.0.7', r);
    await answerStep('10.0.0.7', 's', 'Postgres');
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(sent[0][1], { stepId: 's', runId: 'k3x9qa', prompt: 'p', repo: { url: 'u', branch: 'b' },
    profile: { vendor: 'claude-code', model: 'm', effort: 'high' } });
  assert.deepEqual(sent[1], ['http://10.0.0.7:7070/steps/s/answer', { answer: 'Postgres' }]);
});
