import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { sandboxPod, startStep } from '../src/activities.ts';

test('sandboxPod names the pod and its PVC claim per step, with the f8/step label', () => {
  const pod = sandboxPod('k3x9qa', 'review-3', 'f8-image-tag');
  assert.equal(pod.metadata?.name, 'f8-k3x9qa-review-3');
  assert.deepEqual(pod.metadata?.labels, { app: 'f8-sandbox', 'f8/run': 'k3x9qa', 'f8/step': 'review-3' });
  assert.equal(pod.spec?.volumes?.[0]?.persistentVolumeClaim?.claimName, 'f8-k3x9qa-review-3');
});

test('startStep sends F8_REVIEW_MODEL for the reviewer and F8_MODEL otherwise', async () => {
  const realFetch = globalThis.fetch, realModel = process.env.F8_MODEL, realReview = process.env.F8_REVIEW_MODEL;
  const sent: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(init!.body!));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  process.env.F8_MODEL = 'glm-5.3';
  process.env.F8_REVIEW_MODEL = 'glm-5.3-flash';
  const r = { stepId: 'k3x9qa.build.1', runId: 'k3x9qa', prompt: 'p', repo: { url: 'https://github.com/o/r', branch: 'f8/k3x9qa' } };
  try {
    await startStep('10.0.0.7', r, 'author');
    await startStep('10.0.0.7', { ...r, stepId: 'k3x9qa.review-1.1' }, 'reviewer');
  } finally {
    globalThis.fetch = realFetch;
    if (realModel === undefined) delete process.env.F8_MODEL; else process.env.F8_MODEL = realModel;
    if (realReview === undefined) delete process.env.F8_REVIEW_MODEL; else process.env.F8_REVIEW_MODEL = realReview;
  }
  assert.deepEqual(sent.map(s => (s as { profile: unknown }).profile), [
    { vendor: 'claude-code', model: 'glm-5.3' },
    { vendor: 'claude-code', model: 'glm-5.3-flash' },
  ]);
});

test('the worker exits at start when F8_REVIEW_MODEL is missing or equals F8_MODEL', () => {
  const base = { ...process.env };
  delete base.F8_MODEL, delete base.F8_REVIEW_MODEL;
  for (const env of [base, { ...base, F8_MODEL: 'glm-5.3', F8_REVIEW_MODEL: 'glm-5.3' }]) {
    const p = spawnSync('node', [new URL('../src/main.ts', import.meta.url).pathname],{ env, encoding: 'utf8' });
    assert.notEqual(p.status, 0, JSON.stringify(env));
    assert.match(p.stderr, /F8_REVIEW_MODEL/);
  }
});
