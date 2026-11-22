#!/usr/bin/env node
// The Collie inbox (M8 design D5): each run that waits on a question is a pane in Collie with a text ask, and a reply is
// the run's `answer` signal. Collie's durable wire on :8080 behind the token; Traefik terminates TLS.
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCore, type PaneHandle, wireListener } from '@colliepwa/durable-sdk';
import { Client, Connection } from '@temporalio/client';
import type { RunState } from '../../worker/src/flow.ts';
import { gated, link, seeded, sink, waiting } from './inbox.ts';

const token = process.env.FACTORY8_INBOX_TOKEN, viewer = process.env.FACTORY8_VIEWER_URL;
if (!token || !viewer) throw new Error('FACTORY8_INBOX_TOKEN and FACTORY8_VIEWER_URL must be set');

const client = new Client({ connection: await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' }) });
const stateOf = (runId: string) => client.workflow.getHandle(runId).query<RunState>('state').catch(() => undefined);
const signal = (runId: string, text: string) => client.workflow.getHandle(runId).signal('answer', text);

// Over TLS the token is the only gate, so no allow-always option (WIRE.md 1B).
const core = createCore({ hostName: 'factory8', caps: { asks: true }, allowAlways: false });
const tab = core.workspace('factory8', { title: 'Factory8' }).tab('runs', { title: 'Waiting runs' });
const open = new Map<string, { pane: PaneHandle; askId: string }>();

// shortcut: one query per open run every 10 s; add a search attribute for waiting runs when there are more than a few dozen open runs.
async function poll() {
  const ids: string[] = [];
  for await (const r of client.workflow.list({ query: 'ExecutionStatus = "Running"' })) ids.push(r.workflowId);
  const now = waiting(await Promise.all(ids.map(async runId => ({ runId, state: await stateOf(runId) }))));
  for (const w of now) {
    const cur = open.get(w.runId);
    if (cur?.askId === w.askId) continue;
    cur?.pane.decideAsk(cur.askId); // the run moved on to a new question
    const pane = cur?.pane ?? tab.pane(w.runId, { title: w.runId, harness: 'factory8' });
    pane.seedAsk(seeded(w, link(viewer!, '/sessions', w.runId, w.stage)), sink(w.runId, stateOf, signal));
    open.set(w.runId, { pane, askId: w.askId });
  }
  for (const [runId, { pane, askId }] of open) {
    if (now.some(w => w.runId === runId)) continue;
    pane.decideAsk(askId); // answered elsewhere, cancelled or ended
    pane.close();
    open.delete(runId);
  }
}

// Every waiting run is shown again before Collie reads the layout, so a restart closes nothing.
await poll();
core.ready();
createServer(gated(token, wireListener(core).listener)).listen(8080);
for (;;) {
  await sleep(10_000);
  await poll().catch(e => console.error('poll:', e));
}
