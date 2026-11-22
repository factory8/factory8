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
    deleteWorkspace: async (_run: string, stage: string) => { calls.push(['delete-pvc', stage]); },
  };
  const id = ++n; // a queue per run, so a leftover workflow never reaches another test's mocks
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: `flow-${id}`, activities,
    workflowsPath: new URL('./flows.ts', import.meta.url).pathname });
  const handle = await env.client.workflow.start(type, { args: [{ ...input, ...args }], taskQueue: `flow-${id}`, workflowId: `flow-${id}` });
  return { calls, handle, worker };
}

const order = (calls: unknown[][]) => calls.map(c => `${c[0]} ${c[1]}`);
type State = { stage: string; question?: string; steps: { stage: string; model?: string; result: unknown }[] };

// Polls the run's state until `done` holds, and returns it; the worker must be running.
async function until(w: Awaited<ReturnType<typeof start>>, done: (s: State) => boolean) {
  for (;;) {
    const s = await w.handle.query<State>('state');
    if (done(s)) return s;
    await new Promise(r => setTimeout(r, 50));
  }
}

// Answers the run's first question with `answer`, and returns what the run looked like while it waited.
async function answerFirst(w: Awaited<ReturnType<typeof start>>, answer: string) {
  return w.worker.runUntil(async () => {
    const waiting = { state: await until(w, s => !!s.question), calls: order(w.calls) };
    await w.handle.signal('answer', answer);
    const result = await w.handle.result();
    return { ...waiting, result, end: await w.handle.query<State>('state') }; // a query needs the worker running
  });
}

test('steps run in their own sandboxes, with a record each; ask waits between them with no sandbox', async () => {
  const w = await start('gateFlow', {});
  const { state, calls, result, end } = await answerFirst(w, 'go');
  assert.equal(state.question, 'build PLAN DONE?');
  assert.deepEqual(calls, ['create plan', 'start plan', 'poll plan', 'delete plan', 'delete-pvc plan'], 'no sandbox while it waits');
  assert.deepEqual(state.steps, [{ stage: 'plan', model: 'p', result: 'PLAN DONE' }]);
  assert.deepEqual(Object.keys(state.steps[0]), ['stage', 'model', 'result']);
  assert.equal(result, 'build done');
  assert.deepEqual(order(w.calls).slice(5), ['create build', 'start build', 'poll build', 'delete build', 'delete-pvc build']);
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
  assert.equal(calls.at(-1), 'delete build', 'the pod is gone while it waits, and the PVC stays');
  assert.deepEqual(order(w.calls).slice(4), ['create build', 'answer build', 'poll build', 'delete build', 'delete-pvc build']);
  assert.deepEqual(w.calls.find(c => c[0] === 'answer'), ['answer', 'build', 'Postgres']);
  assert.deepEqual(w.calls.filter(c => c[0] === 'poll').at(-1), ['poll', 'build', 1], 'the poll after the answer starts past the question');
});

test('a failed step deletes its pod, then its PVC', async () => {
  const w = await start('stagesFlow', { stages: ['build'] }, { build: [{ status: 'failed', reason: 'claude exited 1' }] });
  const result = await w.worker.runUntil(w.handle.result().catch((e: Error) => e));
  assert.ok(result instanceof WorkflowFailedError, String(result));
  assert.deepEqual(order(w.calls), ['create build', 'start build', 'poll build', 'delete build', 'delete-pvc build']);
});

const q = (question: string) => ({ status: 'needs_input', question });
const answers = (w: Awaited<ReturnType<typeof start>>) => w.calls.filter(c => c[0] === 'answer').map(c => c[2]);

test('two answers to one question: the step takes the first, and the next question waits for its own', async () => {
  const w = await start('stagesFlow', { stages: ['build'] }, { build: [q('Which DB?'), q('Which port?')] });
  await w.worker.runUntil(async () => {
    await until(w, s => s.question === 'Which DB?');
    await w.handle.signal('answer', 'Postgres');
    await w.handle.signal('answer', 'MySQL'); // say, Collie's tap after `f8 answer`
    const next = await until(w, s => s.question === 'Which port?' || s.steps.length > 0);
    assert.equal(next.question, 'Which port?', 'the second answer is not taken for the next question');
    await w.handle.signal('answer', '5432');
    await w.handle.result();
  });
  assert.deepEqual(answers(w), ['Postgres', '5432']);
});

test('an answer with no question waiting is dropped', async () => {
  const w = await start('stagesFlow', { stages: ['build'] }, { build: [q('Which DB?')] });
  await w.handle.signal('answer', 'early'); // before the worker runs, so before any question
  await w.worker.runUntil(async () => {
    const s = await until(w, s => s.question !== undefined || s.steps.length > 0);
    assert.equal(s.question, 'Which DB?', 'the early answer is not taken');
    await w.handle.signal('answer', 'Postgres');
    await w.handle.result();
  });
  assert.deepEqual(answers(w), ['Postgres']);
});

test('a second question while one waits fails the run with bad_ask', async () => {
  const w = await start('parallelFlow', { stages: ['review-a', 'review-b'] }, { 'review-a': [q('Which DB?')], 'review-b': [q('Which DB?')] });
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
