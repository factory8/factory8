import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type { Exit } from '../src/activities.ts';
import type { StepRequest } from '../../adapter/src/types.ts';

// Local mode with the dev shell's temporal, so nothing is downloaded (M1 design D7).
let env: TestWorkflowEnvironment;
before(async () => {
  const path = execFileSync('which', ['temporal'], { encoding: 'utf8' }).trim();
  env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path } } });
});
after(() => env?.teardown());

// Runs sdlcWorkflow against mocked activities; `exits` maps a stage to its exit event.
async function sdlc(exits: Record<string, { status: string; summary?: string; reason?: string; question?: string }>) {
  const calls: unknown[][] = [];
  const activities = {
    createSandbox: async (...a: unknown[]) => { calls.push(['create', ...a]); return '10.0.0.7'; },
    startStep: async (...a: unknown[]) => { calls.push(['start', a[1], a[2]]); },
    pollStep: async (_ip: unknown, stepId: string) => {
      calls.push(['poll', stepId]);
      const stage = stepId.split('.').at(-2)!;
      const e = exits[stage] ?? { status: 'done', summary: 'ok' };
      return { seq: 3, at: '', stepId, type: 'exit', ...e };
    },
    deleteSandbox: async (...a: unknown[]) => { calls.push(['delete', ...a]); },
  };
  const worker = await Worker.create({
    connection: env.nativeConnection, taskQueue: 'test', activities,
    workflowsPath: new URL('../src/workflows.ts', import.meta.url).pathname,
  });
  let n = 0;
  const result = await worker.runUntil(env.client.workflow.execute('sdlcWorkflow', {
    args: [{ runId: 'k3x9qa', repo: 'https://github.com/o/r', issue: 12 }],
    taskQueue: 'test', workflowId: `k3x9qa-${++n}-${Object.keys(exits).join('.')}`,
  }).catch((e: Error) => e));
  return { result, calls };
}

// The call log as [op, stage, role?] strings, e.g. 'start review-1 reviewer'.
const seq = (calls: unknown[][]) => calls.map(c => {
  if (c[0] === 'start') return [c[0], (c[1] as StepRequest).stepId.split('.')[1], c[2]].join(' ');
  if (c[0] === 'poll') return [c[0], String(c[1]).split('.')[1]].join(' ');
  return [c[0], c[2]].join(' '); // create: [op, runId, stage, repo]; delete: [op, runId, stage]
});

test('ready on the first review: plan, build, review-1, each in its own sandbox', async () => {
  const summary = 'Clean.\nVerdict: ready · https://github.com/o/r/pull/13';
  const { result, calls } = await sdlc({ 'review-1': { status: 'done', summary } });
  assert.equal((result as Exit & { summary: string }).summary, summary);
  assert.deepEqual(seq(calls), [
    'create plan', 'start plan author', 'poll plan', 'delete plan',
    'create build', 'start build author', 'poll build', 'delete build',
    'create review-1', 'start review-1 reviewer', 'poll review-1', 'delete review-1',
  ]);
  assert.deepEqual(calls.filter(c => c[0] === 'create').map(c => c[3]), Array(3).fill('https://github.com/o/r'));
  assert.deepEqual(calls.filter(c => c[0] === 'start').map(c => (c[1] as StepRequest).repo.branch),
    Array(3).fill('f8/k3x9qa'));
});

test('one fix round: review-1 asks for changes, fix-1 runs, review-2 is ready', async () => {
  const { result, calls } = await sdlc({
    'review-1': { status: 'done', summary: 'Verdict: changes · https://github.com/o/r/pull/13' },
    'review-2': { status: 'done', summary: 'Fixed.\nVerdict: ready · https://github.com/o/r/pull/13' },
  });
  assert.equal((result as Exit & { summary: string }).summary, 'Fixed.\nVerdict: ready · https://github.com/o/r/pull/13');
  assert.deepEqual(seq(calls).filter(s => !s.startsWith('poll') && !s.startsWith('delete')), [
    'create plan', 'start plan author', 'create build', 'start build author',
    'create review-1', 'start review-1 reviewer', 'create fix-1', 'start fix-1 author',
    'create review-2', 'start review-2 reviewer',
  ]);
});

test('fix rounds exhausted: changes_requested after fix-2 and review-3', async () => {
  const { result, calls } = await sdlc(Object.fromEntries([1, 2, 3].map(n =>
    [`review-${n}`, { status: 'done', summary: `Verdict: changes · https://github.com/o/r/pull/13` }])));
  assert.ok(result instanceof Error);
  assert.equal((result as { cause?: { type?: string } }).cause?.type, 'changes_requested');
  assert.deepEqual(seq(calls).filter(s => s.startsWith('create')), [
    'create plan', 'create build', 'create review-1', 'create fix-1', 'create review-2', 'create fix-2', 'create review-3',
  ]);
  assert.equal(seq(calls).at(-1), 'delete review-3');
});

test('a failed build deletes its sandbox and no review starts', async () => {
  const { result, calls } = await sdlc({ build: { status: 'failed', reason: 'claude exited 1' } });
  assert.ok(result instanceof Error);
  assert.equal((result.cause as Error).message, 'claude exited 1');
  assert.equal(seq(calls).at(-1), 'delete build');
  assert.ok(!seq(calls).some(s => s.includes('review')));
});

test('a review summary with no verdict fails the run with no_verdict', async () => {
  const { result, calls } = await sdlc({ 'review-1': { status: 'done', summary: 'Looks fine overall.' } });
  assert.ok(result instanceof Error);
  assert.equal((result as { cause?: { type?: string } }).cause?.type, 'no_verdict');
  assert.equal(seq(calls).at(-1), 'delete review-1');
});
