#!/usr/bin/env node
// f8 (M1 design D5, M6 D13, M7 D5): `f8 run [--flow <name>] <issue>` in a clone, and `f8 answer <run> <text>`. Temporal is at TEMPORAL_ADDRESS, by default a port-forward on localhost:7233.
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client, Connection, type WorkflowHandle, WorkflowExecutionAlreadyStartedError, WorkflowFailedError } from '@temporalio/client';
import type { RunState } from '../../worker/src/flow.ts';
import { taskQueue } from '../../worker/src/queue.ts';
import { parseArgs, repoUrl, resultLine } from './run.ts';

const args = parseArgs(process.argv.slice(2));
if (!args) {
  console.error('usage: f8 run [--flow <name>] <issue number>\n       f8 answer <run> "<text>"');
  process.exit(2);
}

const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const client = new Client({ connection });

// A run's `state` query; undefined while the run hasn't registered it, doesn't have one, or doesn't exist.
const stateOf = (id: string) => client.workflow.getHandle(id).query<RunState>('state').catch(() => undefined);

if (args.cmd === 'answer') {
  const s = await stateOf(args.run);
  if (!s?.question) {
    console.error(`run ${args.run} isn't waiting for an answer`);
    process.exit(1);
  }
  await client.workflow.getHandle(args.run).signal('answer', args.text);
  await connection.close();
  process.exit(0);
}

const { issue } = args;
const repo = repoUrl(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }));
const queue = taskQueue(repo);

// Temporal accepts a start on a queue nobody polls, and the run would sit there; a worker that polled in the last
// few minutes counts, so this catches a queue nobody serves, not a crash. No type given means the workflow queue.
const { pollers } = await client.workflowService.describeTaskQueue({ namespace: client.options.namespace, taskQueue: { name: queue } });
if (!pollers?.length) {
  console.error(`no worker serves ${queue}`);
  await connection.close();
  process.exit(1);
}

// 6 random lowercase letters and digits (D1); Temporal rejects a duplicate workflow ID, so pick again.
const newId = () => Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[randomInt(36)]).join('');
let handle: WorkflowHandle;
for (;;) {
  const runId = newId();
  try {
    handle = await client.workflow.start(`${args.flow}Workflow`, { taskQueue: queue, workflowId: runId, args: [{ runId, repo, issue }] });
    break;
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }
}
console.error(`run ${handle.workflowId} started`); // Ctrl-C stops only the wait; the run carries on

// A first workflow task that fails before any completes, such as a flow the worker doesn't have, fails forever:
// nothing has run yet, so f8 ends the run. Returns the failure's message, or undefined once a task has completed.
let started = false;
async function cantStart() {
  for (const e of (await handle.fetchHistory()).events ?? []) {
    if (e.workflowTaskCompletedEventAttributes) { started = true; return; }
    if (e.workflowTaskFailedEventAttributes) return e.workflowTaskFailedEventAttributes.failure?.message ?? 'its first workflow task failed';
  }
}

// Every run is watched through its state: each stage as it starts, each question with the command that answers it.
// A run without a `state` query, such as an SDLC run, prints nothing until it ends.
async function watch() {
  const done = handle.result().then(value => ({ value }), error => ({ error }));
  const seen = new Set<string>();
  let asked: string | undefined;
  for (;;) {
    let timer: NodeJS.Timeout | undefined;
    const r = await Promise.race([done, new Promise<undefined>(res => { timer = setTimeout(() => res(undefined), started ? 10_000 : 1_000); })]);
    clearTimeout(timer); // or the CLI waits out the timer after the run ends
    if (!started) {
      const failure = await cantStart();
      if (failure) {
        await handle.terminate(`f8: the run can't start: ${failure}`);
        console.error(`the run can't start: ${failure}`);
        await connection.close();
        process.exit(1);
      }
    }
    const s = started ? await stateOf(handle.workflowId) : undefined;
    for (const stage of [...(s?.steps.map(x => x.stage) ?? []), s?.stage]) if (stage && !seen.has(stage)) { seen.add(stage); console.error(`stage ${stage}`); }
    if (s?.question !== asked && (asked = s?.question)) console.error(`question: ${asked}\nanswer with: f8 answer ${handle.workflowId} "<text>"`);
    if (r) { if ('error' in r) throw r.error; return r.value; }
  }
}

try {
  console.log(resultLine(await watch()));
} catch (e) {
  if (!(e instanceof WorkflowFailedError)) throw e;
  const cause = e.cause as Error & { type?: string };
  console.error(`${cause.type ?? 'failed'}: ${cause.message}`);
  process.exitCode = 1;
}
await connection.close();
