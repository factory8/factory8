import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { WorkflowFailedError } from '@temporalio/client';
import type { StepRequest } from '../../adapter/src/types.ts';

let env: TestWorkflowEnvironment;
before(async () => {
  const path = execFileSync('which', ['temporal'], { encoding: 'utf8' }).trim();
  env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path } } });
});
after(() => env?.teardown());

const input = { runId: 'k3x9qa', repo: 'https://github.com/o/r', issue: 12 };

// Mocked activities; `script` gives a stage's exits by poll, and a stage not in it is done with summary `<stage> done`.
let n = 0;
async function start(type: string, args: object, script: Record<string, object[]> = {}) {
  const calls: unknown[][] = [];
  const polls: Record<string, number> = {};
  const activities = {
    createSandbox: async (_run: string, stage: string) => { calls.push(['create', stage]); return '10.0.0.7'; },
    startStep: async (_ip: string, r: StepRequest, role?: string) => { calls.push(['start', r.stepId.split('.')[1], r, role]); },
    answerStep: async (_ip: string, id: string, a: string) => { calls.push(['answer', id.split('.')[1], a]); },
    pollStep: async (_ip: string, stepId: string, after = 0) => {
      const stage = stepId.split('.')[1];
      calls.push(['poll', stage, after]);
      const k = polls[stage] = (polls[stage] ?? 0) + 1;
      return { seq: k, at: '', stepId, type: 'exit', ...(script[stage]?.[k - 1] ?? { status: 'done', summary: `${stage} done` }) };
    },
    deleteSandbox: async (_run: string, stage: string) => { calls.push(['delete', stage]); },
  };
  const id = ++n; // a queue per run, so a leftover workflow never reaches another test's mocks
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: `flow-${id}`, activities,
    workflowsPath: new URL('./flows.ts', import.meta.url).pathname });
  const handle = await env.client.workflow.start(type, { args: [{ ...input, ...args }], taskQueue: `flow-${id}`, workflowId: `flow-${id}` });
  return { calls, handle, worker };
}

const order = (calls: unknown[][]) => calls.map(c => `${c[0]} ${c[1]}`);
type State = { stage: string; question?: string; steps: { stage: string; model?: string; result: unknown }[] };

// Answers the run's first question with `answer`, and returns what the run looked like while it waited.
async function answerFirst(w: Awaited<ReturnType<typeof start>>, answer: string) {
  return w.worker.runUntil(async () => {
    for (;;) {
      const s = await w.handle.query<State>('state');
      if (s.question) {
        const waiting = { state: s, calls: order(w.calls) };
        await w.handle.signal('answer', answer);
        const result = await w.handle.result();
        return { ...waiting, result, end: await w.handle.query<State>('state') }; // a query needs the worker running
      }
      await new Promise(r => setTimeout(r, 50));
    }
  });
}

test('steps run in their own sandboxes, with a record each; ask waits between them with no sandbox', async () => {
  const w = await start('gateFlow', {});
  const { state, calls, result, end } = await answerFirst(w, 'go');
  assert.equal(state.question, 'build PLAN DONE?');
  assert.deepEqual(calls, ['create plan', 'start plan', 'poll plan', 'delete plan'], 'no sandbox while it waits');
  assert.deepEqual(state.steps, [{ stage: 'plan', model: 'p', result: 'PLAN DONE' }]);
  assert.deepEqual(Object.keys(state.steps[0]), ['stage', 'model', 'result']);
  assert.equal(result, 'build done');
  assert.deepEqual(order(w.calls).slice(4), ['create build', 'start build', 'poll build', 'delete build']);
  const [plan, build] = w.calls.filter(c => c[0] === 'start');
  assert.deepEqual(plan[2], { stepId: 'k3x9qa.plan.1', runId: 'k3x9qa', prompt: 'make a plan',
    repo: { url: 'https://github.com/o/r', branch: 'factory8/k3x9qa' }, profile: { model: 'p' } });
  assert.equal(build[3], 'author');
  assert.deepEqual(end.steps.at(-1), { stage: 'build', result: 'build done' }, 'a role step has no model');
});

test('a question deletes the pod and shows in state; the answer recreates the sandbox and the step goes on', async () => {
  const w = await start('stagesFlow', { stages: ['build'] }, { build: [{ status: 'needs_input', question: 'Which DB?' }] });
  const { state, calls } = await answerFirst(w, 'Postgres');
  assert.equal(state.question, 'Which DB?');
  assert.equal(state.stage, 'build');
  assert.equal(calls.at(-1), 'delete build', 'the pod is gone while it waits');
  assert.deepEqual(order(w.calls).slice(4), ['create build', 'answer build', 'poll build', 'delete build']);
  assert.deepEqual(w.calls.find(c => c[0] === 'answer'), ['answer', 'build', 'Postgres']);
  assert.deepEqual(w.calls.filter(c => c[0] === 'poll').at(-1), ['poll', 'build', 1], 'the poll after the answer starts past the question');
});

test('a second question while one waits fails the run with bad_ask', async () => {
  const q = { status: 'needs_input', question: 'Which DB?' };
  const w = await start('parallelFlow', { stages: ['review-a', 'review-b'] }, { 'review-a': [q], 'review-b': [q] });
  const result = await w.worker.runUntil(w.handle.result().catch((e: Error) => e));
  assert.ok(result instanceof WorkflowFailedError, String(result));
  assert.equal((result.cause as Error & { type?: string }).type, 'bad_ask');
});

test('a reused stage, or one that is not a DNS label, fails the run with bad_stage before its sandbox', async () => {
  for (const [stages, created] of [[['build', 'build'], ['build']], [['Build Step'], []], [['-x'], []], [['a'.repeat(64)], []]]) {
    const w = await start('stagesFlow', { stages });
    const result = await w.worker.runUntil(w.handle.result().catch((e: Error) => e));
    assert.ok(result instanceof WorkflowFailedError, String(result));
    assert.equal((result.cause as Error & { type?: string }).type, 'bad_stage', String(stages));
    assert.deepEqual(w.calls.filter(c => c[0] === 'create').map(c => c[1]), created, String(stages));
  }
});
