#!/usr/bin/env node
// f8 (M1 design D5): `f8 run <issue>` in a clone. Temporal is at TEMPORAL_ADDRESS, by default a port-forward on localhost:7233.
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client, Connection, WorkflowExecutionAlreadyStartedError, WorkflowFailedError } from '@temporalio/client';
import type { runWorkflow } from '../../worker/src/workflows.ts';
import { repoUrl, taskPrompt } from './run.ts';

const [cmd, arg] = process.argv.slice(2);
const issue = Number(arg);
if (cmd !== 'run' || !Number.isInteger(issue) || issue < 1) {
  console.error('usage: f8 run <issue number>');
  process.exit(2);
}

const repo = repoUrl(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }));
const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const client = new Client({ connection });

// 6 random lowercase letters and digits (D1); Temporal rejects a duplicate workflow ID, so pick again.
const newId = () => Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[randomInt(36)]).join('');
let handle;
for (;;) {
  const runId = newId();
  try {
    handle = await client.workflow.start<typeof runWorkflow>('runWorkflow', {
      taskQueue: 'factory8', workflowId: runId, args: [{ runId, repo, prompt: taskPrompt(issue, runId) }],
    });
    break;
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }
}
console.error(`run ${handle.workflowId} started`); // Ctrl-C stops only the wait; the run carries on

try {
  console.log((await handle.result()).summary);
} catch (e) {
  if (!(e instanceof WorkflowFailedError)) throw e;
  const cause = e.cause as Error & { type?: string };
  console.error(`${cause.type ?? 'failed'}: ${cause.message}`);
  process.exitCode = 1;
}
await connection.close();
