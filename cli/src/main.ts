#!/usr/bin/env node
// f8 (M1 design D5, M6 D13): `f8 run [--flow ship] <issue>` in a clone, and `f8 answer <run> <text>`. Temporal is at TEMPORAL_ADDRESS, by default a port-forward on localhost:7233.
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client, Connection, type WorkflowHandle, WorkflowExecutionAlreadyStartedError, WorkflowFailedError } from '@temporalio/client';
import { parseArgs, repoUrl } from './run.ts';

const args = parseArgs(process.argv.slice(2));
if (!args) {
  console.error('usage: f8 run [--flow ship] <issue number>\n       f8 answer <run> "<text>"');
  process.exit(2);
}

const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const client = new Client({ connection });

// What the ship run's `state` query answers; undefined while the run hasn't registered it or doesn't exist.
type ShipState = { stage: string; question?: string; steps: { stage: string }[] };
const stateOf = (id: string) => client.workflow.getHandle(id).query<ShipState>('state').catch(() => undefined);

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

// 6 random lowercase letters and digits (D1); Temporal rejects a duplicate workflow ID, so pick again.
const newId = () => Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[randomInt(36)]).join('');
let handle: WorkflowHandle;
for (;;) {
  const runId = newId();
  try {
    handle = await client.workflow.start(args.flow === 'ship' ? 'shipWorkflow' : 'sdlcWorkflow', {
      taskQueue: 'factory8', workflowId: runId, args: [{ runId, repo, issue }],
    });
    break;
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }
}
console.error(`run ${handle.workflowId} started`); // Ctrl-C stops only the wait; the run carries on

// A ship run is watched through its state: each stage as it starts, each question with the command that answers it.
async function watch() {
  const done = handle.result().then(value => ({ value }), error => ({ error }));
  const seen = new Set<string>();
  let asked: string | undefined;
  for (;;) {
    const r = await Promise.race([done, new Promise<undefined>(res => setTimeout(res, 10_000))]);
    const s = await stateOf(handle.workflowId);
    for (const stage of [...(s?.steps.map(x => x.stage) ?? []), s?.stage]) if (stage && !seen.has(stage)) { seen.add(stage); console.error(`stage ${stage}`); }
    if (s?.question !== asked && (asked = s?.question)) console.error(`question: ${asked}\nanswer with: f8 answer ${handle.workflowId} "<text>"`);
    if (r) { if ('error' in r) throw r.error; return r.value; }
  }
}

try {
  if (args.flow === 'ship') console.log(((await watch()) as { url: string }).url);
  else console.log((await handle.result() as { summary: string }).summary);
} catch (e) {
  if (!(e instanceof WorkflowFailedError)) throw e;
  const cause = e.cause as Error & { type?: string };
  console.error(`${cause.type ?? 'failed'}: ${cause.message}`);
  process.exitCode = 1;
}
await connection.close();
