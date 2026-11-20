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

const bands = { design: { model: 'd' }, acceptance: { model: 'ac', effort: 'high' },
  implement: [{ model: 'i1' }, { model: 'i2' }, { model: 'i3', effort: 'high' }], review: { model: 'r' }, diagnose: { model: 'dg' }, finish: { model: 'f' } };
const J = JSON.stringify;
const finding = (severity: string, message = 'm') => ({ severity, message });
const SHIP = { verdict: 'SHIP', determinate_fix: false, findings: [] };
const NO = (...fs: ReturnType<typeof finding>[]) => ({ verdict: 'DO_NOT_SHIP', determinate_fix: false, findings: fs.length ? fs : [finding('blocker')] });
const design = (risk = 'low') => ({ outcome: 'pushed', sha: 'd1', pr: 18, risk });
const stop = (cause: string) => ({ outcome: 'stopped', cause, note: `stop ${cause}` });

// What an agent says by default at each stage; `script` overrides by stage name, or by `stage#poll` for a second poll.
function say(stage: string) {
  const kind = stage.replace(/-\d+[ab]?$/, '');
  const n = stage.match(/-(\d+)/)?.[1];
  return ({
    design: design(), 'design-review': SHIP, acceptance: { outcome: 'pushed', sha: 'a1', tests: ['t.test.ts'] }, 'tests-review': SHIP,
    implement: { outcome: 'pushed', sha: `i${n}` }, 'code-review': SHIP, tiebreak: SHIP,
    diagnose: { cause: 'D', evidence: 'e' }, finish: { ok: true, url: 'https://github.com/o/r/pull/18' },
  } as Record<string, unknown>)[kind];
}

let n = 0;
async function start(script: Record<string, unknown> = {}, cfg: object | null = bands, gate?: { stage: string; until: Promise<void> }) {
  const calls: unknown[][] = [];
  const polls: Record<string, number> = {};
  const activities = {
    shipConfig: async () => { if (!cfg) throw new Error('bad'); return { bands: cfg, plugin: { url: 'https://github.com/o/p', ref: 'c0ffee' } }; },
    createSandbox: async (...a: unknown[]) => { calls.push(['create', a[1]]); return '10.0.0.7'; },
    startStep: async (_ip: unknown, r: StepRequest) => { calls.push(['start', r.stepId.split('.')[1], r]); },
    answerStep: async (_ip: unknown, id: string, a: string) => { calls.push(['answer', id.split('.')[1], a]); },
    pollStep: async (_ip: unknown, stepId: string, after = 0) => {
      const stage = stepId.split('.')[1];
      calls.push(['poll', stage, after]);
      if (gate?.stage === stage) await gate.until;
      const k = polls[stage] = (polls[stage] ?? 0) + 1;
      const v = script[`${stage}#${k}`] ?? script[stage] ?? say(stage);
      const exit = typeof v === 'object' && v && 'status' in v ? v
        : { status: 'done', summary: typeof v === 'string' ? v : `Notes.\n${J(v)}` };
      return { seq: k, at: '', stepId, type: 'exit', ...exit }; // the k-th exit in the step's log
    },
    deleteSandbox: async (...a: unknown[]) => { calls.push(['delete', a[1]]); },
  };
  const id = ++n; // a queue per run, so a leftover workflow never reaches another test's mocks
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: `test-${id}`, activities,
    workflowsPath: new URL('../src/workflows.ts', import.meta.url).pathname });
  const handle = await env.client.workflow.start('shipWorkflow', { args: [{ runId: 'k3x9qa', repo: 'https://github.com/o/r', issue: 12 }],
    taskQueue: `test-${id}`, workflowId: `ship-${id}` });
  return { calls, handle, worker };
}

async function ship(script: Record<string, unknown> = {}, cfg: object | null = bands) {
  const { calls, handle, worker } = await start(script, cfg);
  const result = await worker.runUntil(handle.result().catch((e: Error) => e));
  return { calls, result };
}

const starts = (calls: unknown[][]) => calls.filter(c => c[0] === 'start').map(c => c[1] as string);
const reqs = (calls: unknown[][]) => calls.filter(c => c[0] === 'start').map(c => c[2] as StepRequest);
const prompt = (calls: unknown[][], stage: string) => reqs(calls).find(r => r.stepId.split('.')[1] === stage)!.prompt;
const failure = (r: unknown) => {
  assert.ok(r instanceof WorkflowFailedError, String(r));
  const c = r.cause as Error & { type?: string };
  return { type: c.type, message: c.message };
};

test('straight through: steps in order, a sandbox each, the stage profiles, the plugin pinned to one commit', async () => {
  const { calls, result } = await ship();
  assert.deepEqual(result, { outcome: 'ready', pr: 18, url: 'https://github.com/o/r/pull/18' });
  const order = ['design-1', 'design-review-1', 'acceptance-1', 'tests-review-1', 'implement-1', 'code-review-1', 'finish'];
  assert.deepEqual(starts(calls), order);
  for (const s of order) {
    assert.equal(calls.filter(c => c[0] === 'create' && c[1] === s).length, 1, `create ${s}`);
    assert.equal(calls.filter(c => c[0] === 'delete' && c[1] === s).length, 1, `delete ${s}`);
  }
  assert.deepEqual(reqs(calls).map(r => r.profile), [bands.design, bands.review, bands.acceptance, bands.review, bands.implement[0], bands.review, bands.finish]
    );
  assert.deepEqual(new Set(reqs(calls).map(r => r.plugin!.ref)), new Set(['c0ffee']));
  assert.equal(reqs(calls)[0].plugin!.url, 'https://github.com/o/p');
  assert.equal(prompt(calls, 'code-review-1'), '/factory8:review 12 run=k3x9qa mode=code pr=18 sha=i1 slot=1\n{"tests_sha":"a1","tests":["t.test.ts"]}');
  assert.equal(reqs(calls)[0].repo.branch, 'factory8/k3x9qa');
});

test('a design fixed after its review runs again with the blocking findings', async () => {
  const { calls, result } = await ship({ 'design-review-1': NO(finding('critical', 'no row'), finding('low')) });
  assert.equal((result as { outcome: string }).outcome, 'ready');
  assert.deepEqual(starts(calls).slice(0, 4), ['design-1', 'design-review-1', 'design-2', 'design-review-2']);
  assert.match(prompt(calls, 'design-2'), /^\/factory8:design 12 run=k3x9qa pr=18\n\{"findings":\[\{"severity":"critical","message":"no row"\}\]\}$/);
});

test('design or tests rejected twice end escalated, and the PR is told', async () => {
  for (const [rejected, cause, after] of [['design-review', 'design_rejected', 'acceptance-1'], ['tests-review', 'tests_rejected', 'implement-1']]) {
    const { calls, result } = await ship({ [`${rejected}-1`]: NO(), [`${rejected}-2`]: NO() });
    assert.equal(failure(result).type, 'escalated');
    assert.match(failure(result).message, new RegExp(`^${cause}`));
    assert.ok(!starts(calls).includes(after), `${after} must not run`);
    assert.equal(starts(calls).at(-1), 'finish');
    assert.match(prompt(calls, 'finish'), /outcome=escalated pr=18\n/);
  }
});

test('a design stopped with C ends too_big, with a finish on the issue', async () => {
  const { calls, result } = await ship({ 'design-1': stop('C') });
  assert.deepEqual(failure(result), { type: 'too_big', message: 'C: stop C' });
  assert.deepEqual(starts(calls), ['design-1', 'finish']);
  assert.match(prompt(calls, 'finish'), /^\/factory8:finish 12 run=k3x9qa outcome=too_big\n/);
});

test('an invalid result parks the run with cause H, naming the step', async () => {
  const { calls, result } = await ship({ 'code-review-1': { verdict: 'SHIP', determinate_fix: false, findings: [finding('critical')] } });
  assert.equal(failure(result).type, 'parked');
  assert.match(failure(result).message, /^H: code-review-1/);
  assert.equal(starts(calls).at(-1), 'finish');
});

test('a failed step fails the run at once, with no finish, and its pod deleted', async () => {
  const { calls, result } = await ship({ 'acceptance-1': { status: 'failed', reason: 'boom' } });
  assert.deepEqual(failure(result), { type: 'failed', message: 'acceptance-1: boom' });
  assert.ok(!starts(calls).includes('finish'));
  assert.ok(calls.some(c => c[0] === 'delete' && c[1] === 'acceptance-1'));
});

test('bad settings fail the run before any sandbox', async () => {
  const { calls, result } = await ship({}, null);
  assert.ok(result instanceof WorkflowFailedError);
  assert.equal(calls.length, 0);
});

test('the finish report carries the non-blocking findings and the run is ready', async () => {
  const { calls } = await ship({ 'code-review-1': { ...SHIP, findings: [finding('medium', 'rename x')] } });
  assert.match(prompt(calls, 'finish'), /outcome=ready pr=18\n.*Follow-ups.*medium \(code-review-1\): rename x/);
});

test('the state query shows the stage, risk, PR and finished steps mid-run', async () => {
  let release!: () => void;
  const { handle, worker } = await start({}, bands, { stage: 'implement-1', until: new Promise<void>(r => { release = r; }) });
  const seen = await worker.runUntil(async () => {
    for (;;) {
      const s = await handle.query<{ stage: string; steps: { stage: string }[] }>('state');
      if (s.stage === 'implement-1') { const copy = structuredClone(s); release(); await handle.result(); return copy; }
      await new Promise(r => setTimeout(r, 50));
    }
  });
  assert.deepEqual(seen, { stage: 'implement-1', risk: 'low', pr: 18, steps: seen.steps });
  assert.deepEqual(seen.steps.map(s => s.stage), ['design-1', 'design-review-1', 'acceptance-1', 'tests-review-1']);
  assert.deepEqual(Object.keys(seen.steps[0]), ['stage', 'model', 'result']);
});

// 6.7: the implement loop

test('the ladder climbs one profile per attempt and the last repeats; a bounce starts again at profile 1', async () => {
  const { calls, result } = await ship({
    'code-review-1': NO(), 'code-review-2': NO(), diagnose: { cause: 'D', evidence: 'e' }, 'code-review-3': NO(), // D → a third attempt, which fails
  });
  assert.equal(failure(result).type, 'escalated');
  assert.deepEqual(reqs(calls).filter(r => r.stepId.includes('.implement-')).map(r => r.profile.model), ['i1', 'i2', 'i3']);
  const b = await ship({ 'code-review-1': NO(), 'code-review-2': NO(), 'diagnose-1': { cause: 'A', evidence: 'wrong tests' }, 'implement-3': stop('C') });
  assert.deepEqual(reqs(b.calls).filter(r => r.stepId.includes('.implement-')).map(r => r.profile.model), ['i1', 'i2', 'i1']);
});

test('two failed attempts run diagnose with the history; D allows one more attempt, then attempts_exhausted', async () => {
  const { calls, result } = await ship({ 'code-review-1': NO(finding('blocker', 'x')), 'code-review-2': NO(finding('critical', 'y')), 'code-review-3': NO() });
  assert.deepEqual(failure(result), { type: 'escalated', message: 'attempts_exhausted: still failing after 3 attempts' });
  const s = starts(calls);
  assert.deepEqual(s.slice(4), ['implement-1', 'code-review-1', 'implement-2', 'code-review-2', 'diagnose-1', 'implement-3', 'code-review-3', 'finish']);
  assert.match(prompt(calls, 'diagnose-1'), /^\/factory8:diagnose 12 run=k3x9qa pr=18\n\{"attempts":\[\{"attempt":1,"sha":"i1".*"attempt":2,"sha":"i2"/);
  assert.match(prompt(calls, 'implement-2'), /\{"findings":\[\{"severity":"blocker","message":"x"\}\]\}$/);
});

test('a risk raised by the design review sends each attempt to two reviewers in turn, and a split verdict fails it', async () => {
  const { calls } = await ship({ 'design-review-1': { ...SHIP, risk: 'high' }, 'code-review-1b': NO(finding('blocker', 'from b')) });
  assert.ok(starts(calls).includes('code-review-1a') && starts(calls).includes('code-review-1b'));
  const order = calls.map(c => `${c[0]} ${c[1]}`);
  assert.ok(order.indexOf('delete code-review-1a') < order.indexOf('create code-review-1b'), 'b starts after a is done');
  assert.match(prompt(calls, 'implement-2'), /"from b"/);
  assert.ok(starts(calls).includes('code-review-2a') && starts(calls).includes('code-review-2b'));
  assert.equal(prompt(calls, 'code-review-1b').split('\n')[0], '/factory8:review 12 run=k3x9qa mode=code pr=18 sha=i1 slot=2');
});

test('diagnosis F runs a tie-break, which can bring a high-risk attempt to ready', async () => {
  const { calls, result } = await ship({ 'design-1': design('high'), 'code-review-1a': NO(), 'code-review-1b': NO(), 'code-review-2a': NO(), 'code-review-2b': SHIP,
    'diagnose-1': { cause: 'F', evidence: 'dispute' } });
  assert.equal((result as { outcome: string }).outcome, 'ready');
  assert.ok(starts(calls).includes('tiebreak-1'));
  assert.equal(starts(calls).at(-1), 'finish');
});

test('causes route: A to acceptance-2, B to design-2 then acceptance again, C to too_big, H to parked', async () => {
  const a = await ship({ 'implement-1': stop('A') });
  assert.deepEqual(starts(a.calls).slice(4, 9), ['implement-1', 'acceptance-2', 'tests-review-2', 'implement-2', 'code-review-1']);
  assert.match(prompt(a.calls, 'acceptance-2'), /\{"note":"stop A"\}$/);

  const b = await ship({ 'implement-1': stop('B') });
  assert.deepEqual(starts(b.calls).slice(4, 11), ['implement-1', 'design-2', 'design-review-2', 'acceptance-2', 'tests-review-2', 'implement-2', 'code-review-1']);

  assert.equal(failure((await ship({ 'implement-1': stop('C') })).result).type, 'too_big');
  const h = await ship({ 'code-review-1': NO(), 'code-review-2': NO(), 'diagnose-1': { cause: 'H', evidence: 'harness' } });
  assert.deepEqual(failure(h.result), { type: 'parked', message: 'H: harness' });
});

test('a third route back ends escalated with bounces_exhausted', async () => {
  const { result } = await ship({ 'implement-1': stop('A'), 'implement-2': stop('A'), 'implement-3': stop('A') });
  assert.deepEqual(failure(result), { type: 'escalated', message: 'bounces_exhausted: routed back more than 2 times' });
});

// 6.8: human waits

test('a question deletes the pod and shows in state; the answer recreates the sandbox and the step goes on', async () => {
  const { calls, handle, worker } = await start({ 'implement-1#1': { status: 'needs_input', question: 'Which DB?' } });
  const q = await worker.runUntil(async () => {
    for (;;) {
      const s = await handle.query<{ question?: string }>('state');
      if (s.question) {
        const snapshot = calls.map(c => `${c[0]} ${c[1]}`);
        await handle.signal('answer', 'Postgres');
        await handle.result();
        return { question: s.question, snapshot };
      }
      await new Promise(r => setTimeout(r, 50));
    }
  });
  assert.equal(q.question, 'Which DB?');
  assert.equal(q.snapshot.at(-1), 'delete implement-1', 'the pod is gone while it waits');
  const i = calls.findIndex(c => c[0] === 'answer');
  assert.deepEqual(calls[i], ['answer', 'implement-1', 'Postgres']);
  assert.deepEqual(calls.slice(i - 1, i + 2).map(c => `${c[0]} ${c[1]}`), ['create implement-1', 'answer implement-1', 'poll implement-1']);
  assert.deepEqual(calls[i + 1], ['poll', 'implement-1', 1], 'the poll after the answer starts past the question\'s exit');
  assert.equal(calls.filter(c => c[0] === 'create' && c[1] === 'implement-1').length, 2);
});

test('a second question waits again; diagnosis E waits with no pod, then design runs with the answer', async () => {
  const { calls, handle, worker } = await start({
    'implement-1#1': { status: 'needs_input', question: 'one?' }, 'implement-1#2': { status: 'needs_input', question: 'two?' },
    'code-review-1': NO(), 'code-review-2': NO(), 'diagnose-1': { cause: 'E', evidence: 'which API?' },
  });
  await worker.runUntil(async () => {
    const asked: string[] = [];
    const done = handle.result();
    for (let sent = 0; sent < 3;) {
      const s = await handle.query<{ question?: string }>('state');
      if (s.question && !asked.includes(s.question + sent)) { asked.push(s.question + sent); await handle.signal('answer', `a${++sent}`); }
      await new Promise(r => setTimeout(r, 50));
    }
    await done;
    assert.deepEqual(asked, ['one?0', 'two?1', 'which API?2']);
  });
  assert.equal(calls.filter(c => c[0] === 'answer').length, 2);
  assert.match(prompt(calls, 'design-2'), /\{"answer":"a3"\}$/);
});
