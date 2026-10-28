import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type { Exit } from '../src/activities.ts';
import type { EventBody, StepRequest } from '../../adapter/src/types.ts';

// Local mode with the dev shell's temporal, so nothing is downloaded (M1 design D7).
let env: TestWorkflowEnvironment;
before(async () => {
  const path = execFileSync('which', ['temporal'], { encoding: 'utf8' }).trim();
  env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path } } });
});
after(() => env?.teardown());

// Runs the workflow against mocked activities whose step ends with `exit`.
async function run(exit: Extract<EventBody, { type: 'exit' }>) {
  const calls: unknown[][] = [];
  const activities = {
    createSandbox: async (...a: unknown[]) => { calls.push(['create', ...a]); return '10.0.0.7'; },
    startStep: async (...a: unknown[]) => { calls.push(['start', ...a]); },
    pollStep: async (...a: unknown[]) => { calls.push(['poll', ...a]); return { seq: 3, at: '', stepId: 'k3x9qa.build.1', ...exit }; },
    deleteSandbox: async (...a: unknown[]) => { calls.push(['delete', ...a]); },
  };
  const worker = await Worker.create({
    connection: env.nativeConnection, taskQueue: 'test', activities,
    workflowsPath: new URL('../src/workflows.ts', import.meta.url).pathname,
  });
  const result = await worker.runUntil(env.client.workflow.execute('runWorkflow', {
    args: [{ runId: 'k3x9qa', repo: 'https://github.com/o/r', prompt: 'Resolve #12' }],
    taskQueue: 'test', workflowId: `k3x9qa-${exit.status}`,
  }).catch((e: Error) => e));
  return { result, calls };
}

test('a done step is the run result, and the sandbox is deleted', async () => {
  const { result, calls } = await run({ type: 'exit', status: 'done', summary: 'Opened a draft PR' });
  assert.equal((result as Exit & { summary: string }).summary, 'Opened a draft PR');
  assert.deepEqual(calls.map(c => c[0]), ['create', 'start', 'poll', 'delete']);
  assert.deepEqual(calls[0], ['create', 'k3x9qa', 'https://github.com/o/r']);
  const step = calls[1][2] as StepRequest;
  assert.deepEqual([step.stepId, step.repo.branch, step.prompt, step.profile], ['k3x9qa.build.1', 'f8/k3x9qa', 'Resolve #12', undefined]);
  assert.deepEqual(calls[3], ['delete', 'k3x9qa']);
});

for (const [exit, why] of [
  [{ type: 'exit', status: 'failed', reason: 'claude exited 1' }, 'claude exited 1'],
  [{ type: 'exit', status: 'needs_input', question: 'Which DB?' }, 'Which DB?'],
] as const) {
  test(`a ${exit.status} step fails the run with "${why}", and the sandbox is deleted`, async () => {
    const { result, calls } = await run(exit);
    assert.ok(result instanceof Error);
    assert.equal((result.cause as Error).message, why);
    assert.equal(calls.at(-1)?.[0], 'delete');
  });
}
