// The Collie inbox's parts (M8 design D5): the runs that wait, an ask for each, the sink a reply goes to, and the token gate.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { RequestListener } from 'node:http';
import { type Ask, type AskSink, bytes, CAPS, cut, HttpError, type SeededAsk } from '@colliepwa/durable-sdk';
import type { RunState } from '../../worker/src/flow.ts';

export interface Waiting { runId: string; stage: string; question: string; askId: string }

// The same run, stage and question keep one ask, and its one push, across inbox restarts.
// shortcut: the same question asked again in the same stage keeps its closed ask, so only `f8 answer` answers it; add a
// question count to `state` if agents re-ask.
export const askId = (runId: string, stage: string, question: string) =>
  createHash('sha256').update(`${runId}\n${stage}\n${question}`).digest('hex').slice(0, 32);

// A run with no `state` query, such as an SDLC run, or with no question, has no ask.
export const waiting = (runs: { runId: string; state?: RunState }[]): Waiting[] =>
  runs.flatMap(({ runId, state: s }) =>
    s?.question === undefined ? [] : [{ runId, stage: s.stage, question: s.question, askId: askId(runId, s.stage, s.question) }]);

// The waiting step's session in the viewer, by the ID the adapter keeps in the step's folder of the log volume.
export function link(viewerUrl: string, sessions: string, runId: string, stage: string): string | undefined {
  let id;
  try { id = readFileSync(`${sessions}/${runId}-${stage}/state/session`, 'utf8').trim(); } catch { return undefined; }
  return /^[\w-]+$/.test(id) ? `${viewerUrl}/sessions/${id}` : undefined; // the sandbox writes that file: an ID or nothing
}

// A text ask titled by run and stage, its body the question and then the link, cut so the link always fits.
export function seeded(w: Waiting, href?: string): SeededAsk {
  const tail = href ? `\n\n${href}` : '', title = `${w.runId} · ${w.stage}`;
  const ask: Ask = {
    id: w.askId, kind: 'text', toolCallId: w.askId, itemId: w.askId, revision: 1, title, options: [], maxLength: 2000,
    reason: cut(w.question, CAPS.reason - bytes(tail), true) + tail, push: { title, line: w.question },
  };
  return { askId: w.askId, toolCallId: w.askId, argsHash: w.askId, ask, openedAt: new Date().toISOString() };
}

// A reply answers the run only while it still waits on that ask's question; the workflow drops a racing second one (D6).
export const sink = (
  runId: string,
  stateOf: (runId: string) => Promise<RunState | undefined>,
  signal: (runId: string, text: string) => Promise<void>,
): AskSink => ({
  async answer(id, _revision, answer) {
    const text = 'text' in answer ? answer.text : '';
    if (!text.trim()) throw new HttpError(400, 'bad-body', { message: 'a blank answer is no answer' }); // as f8 answer (#19)
    const s = await stateOf(runId);
    if (s?.question === undefined || askId(runId, s.stage, s.question) !== id) return { taken: false, tooLate: true };
    await signal(runId, text);
    return { taken: true };
  },
});

// Every request needs the token (WIRE.md 1B). Hashing both sides gives timingSafeEqual the equal lengths it needs.
export function gated(token: string, listener: RequestListener): RequestListener {
  const digest = (s: string) => createHash('sha256').update(s).digest(), want = digest(`Bearer ${token}`);
  return (req, res) => timingSafeEqual(digest(req.headers.authorization ?? ''), want) ? listener(req, res) : res.writeHead(401).end();
}
