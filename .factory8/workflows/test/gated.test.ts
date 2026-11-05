import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { WorkflowFailedError } from '@temporalio/client';

let env: TestWorkflowEnvironment;
before(async () => {
  const path = execFileSync('which', ['temporal'], { encoding: 'utf8' }).trim();
  env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path } } });
});
after(() => env?.teardown());

// Runs gatedWorkflow with mocked activities, where every step is done with summary `<stage> done`,
// and answers its question with `answer`.
let n = 0;
async function gated(answer: string) {
  const calls: string[] = [];
  const activities = {
    createSandbox: async (_run: string, stage: string) => { calls.push(`create ${stage}`); return '10.0.0.7'; },
    startStep: async (_ip: string, r: { stepId: string }, role?: string) => { calls.push(`start ${r.stepId.split('.')[1]} ${role}`); },
    pollStep: async (_ip: string, stepId: string) =>
      ({ seq: 1, at: '', stepId, type: 'exit', status: 'done', summary: `${stepId.split('.')[1]} done` }),
    deleteSandbox: async (_run: string, stage: string) => { calls.push(`delete ${stage}`); },
  };
  const q = `gated-${++n}`; // a queue per run, so a leftover workflow never reaches another test's mocks
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: q, activities,
    workflowsPath: new URL('../index.ts', import.meta.url).pathname });
  const handle = await env.client.workflow.start('gatedWorkflow', {
    args: [{ runId: 'k3x9qa', repo: 'https://github.com/factory8/factory8', issue: 12 }], taskQueue: q, workflowId: q });
  return worker.runUntil(async () => {
    let s: { question?: string };
    while (!(s = await handle.query<{ question?: string }>('state')).question) await new Promise(r => setTimeout(r, 50));
    const waiting = [...calls];
    await handle.signal('answer', answer);
    return { question: s.question, waiting, calls, result: await handle.result().catch((e: Error) => e) };
  });
}

test('go builds and returns the build\'s summary; no sandbox while it waits', async () => {
  const r = await gated('go');
  assert.equal(r.question, 'plan done\n\nReply `go` to build, anything else to stop.');
  assert.deepEqual(r.waiting, ['create plan', 'start plan author', 'delete plan']);
  assert.deepEqual(r.result, { summary: 'build done' });
  assert.deepEqual(r.calls.slice(3), ['create build', 'start build author', 'delete build']);
});

test('anything else fails the run with rejected and the answer, and builds nothing', async () => {
  const r = await gated('not yet');
  assert.ok(r.result instanceof WorkflowFailedError, String(r.result));
  const cause = r.result.cause as Error & { type?: string };
  assert.deepEqual([cause.type, cause.message], ['rejected', 'not yet']);
  assert.deepEqual(r.calls, ['create plan', 'start plan author', 'delete plan']);
});
