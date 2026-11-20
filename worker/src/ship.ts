// The ship run (M6 design D1, D2, D7–D12): one issue through design, tests, implementation and review, each step in its own sandbox.
import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.ts';
import { run, type RunInput, type RunState as Base } from './flow.ts';
import { blocking, command, parseResult, passes, report, type Finding, type Review, type Skill } from './results.ts';

const { shipConfig } = proxyActivities<typeof activities>({ startToCloseTimeout: '5m', retry: { maximumAttempts: 1 } });

// No speculative config (M5 D4): these become FACTORY8_BANDS keys when someone needs to change one.
const CONTRACT_MAX = 2, REWORK_MAX = 2, DETERMINATE_EXTRA = 1, BOUNCES_MAX = 2;

export interface RunState extends Base { risk: 'low' | 'high'; pr?: number }
type Outcome = 'ready' | 'escalated' | 'too_big' | 'parked';
class Ended {
  outcome: Outcome; cause: string; note: string;
  constructor(outcome: Outcome, cause: string, note: string) { this.outcome = outcome; this.cause = cause; this.note = note; }
}
type Route = { to: 'design' | 'acceptance'; ctx?: unknown; count: boolean };
type Tests = { sha: string; files: string[] };
type Attempt = { attempt: number; sha: string; reviews: { stage: string; verdict: string; findings: Finding[] }[] };

export async function shipWorkflow(input: RunInput) {
  const { runId, issue } = input;
  const { state: st, ask, step: runStep } = run<Omit<RunState, keyof Base>>(input, { risk: 'low' });
  const causes: { cause: string; note: string }[] = [];
  const counts: Record<string, number> = {};
  const { bands, plugin } = await shipConfig(); // before any sandbox, so bad settings fail the run at once

  const count = (kind: string) => counts[kind] = (counts[kind] ?? 0) + 1;
  const cmd = (skill: Skill, args: Record<string, string | number | undefined>, ctx?: unknown) =>
    command(skill, issue, { run: runId, ...args }, ctx);

  // A stage's step (flow.ts) with its profile and the pinned plugin; a result the skill's shape rejects parks the run (H).
  const step = <K extends Skill>(kind: K, stage: string, prompt: string, profile: activities.Profile) =>
    runStep(stage, prompt, { profile, plugin, parse: s => {
      try { return parseResult(kind, s); } catch (e) { throw new Ended('parked', 'H', `${stage}: ${(e as Error).message}`); }
    } });

  // Where a stop cause or a diagnosis sends the run (D7). D and F are the implement loop's own.
  async function route(cause: string, note: string): Promise<Route> {
    if (cause === 'C') throw new Ended('too_big', 'C', note);
    if (cause === 'H' || cause === 'I') throw new Ended('parked', cause, note);
    causes.push({ cause, note });
    if (cause === 'A') return { to: 'acceptance', ctx: { note }, count: true };
    if (cause === 'E') return { to: 'design', ctx: { answer: await ask(note) }, count: false };
    return { to: 'design', ctx: { note }, count: true }; // B, G, and any other cause
  }

  const blockers = (r: Review) => r.findings.filter(blocking);

  async function designPhase(ctx?: unknown) {
    for (let grade = 1; ; grade++) {
      const d = await step('design', `design-${count('design')}`, cmd('design', { pr: st.pr }, ctx), bands.design);
      if (d.outcome === 'stopped') throw new Ended('too_big', d.cause, d.note); // only C is allowed
      st.pr = d.pr;
      if (d.risk === 'high') st.risk = 'high'; // nothing lowers it
      const r = await step('review', `design-review-${count('design-review')}`, cmd('review', { mode: 'design', pr: st.pr, sha: d.sha }), bands.review);
      if (r.risk === 'high') st.risk = 'high';
      if (passes(r)) return;
      if (grade >= CONTRACT_MAX) throw new Ended('escalated', 'design_rejected', `the design wasn't accepted in ${CONTRACT_MAX} grades`);
      ctx = { findings: blockers(r) };
    }
  }

  // Tests that pass their review, or the route a stop sends the run on.
  async function testsPhase(ctx?: unknown): Promise<Tests | Route> {
    for (let grade = 1; ; grade++) {
      const a = await step('acceptance', `acceptance-${count('acceptance')}`, cmd('acceptance', { pr: st.pr }, ctx), bands.acceptance);
      if (a.outcome === 'stopped') return route(a.cause, a.note);
      const r = await step('review', `tests-review-${count('tests-review')}`, cmd('review', { mode: 'tests', pr: st.pr, sha: a.sha }), bands.review);
      if (passes(r)) return { sha: a.sha, files: a.tests! };
      if (grade >= CONTRACT_MAX) throw new Ended('escalated', 'tests_rejected', `the tests weren't accepted in ${CONTRACT_MAX} grades`);
      ctx = { findings: blockers(r) };
    }
  }

  // One reviewer, or two in turn when the risk is high (D8): in turn, so only one question waits at a time.
  async function codeReviews(sha: string, tests: Tests) {
    const n = count('code-review'), slots = st.risk === 'high' ? ['a', 'b'] : [''];
    const out: { stage: string; review: Review }[] = [];
    for (const [i, s] of slots.entries()) {
      const stage = `code-review-${n}${s}`;
      out.push({ stage, review: await step('review', stage,
        cmd('review', { mode: 'code', pr: st.pr, sha, slot: i + 1 }, { tests_sha: tests.sha, tests: tests.files }), bands.review) });
    }
    return out;
  }

  // Graded attempts up the ladder; 'ready', or the route out of the loop (D7).
  async function implementLoop(tests: Tests): Promise<'ready' | Route> {
    const history: Attempt[] = [];
    let findings: Finding[] | undefined, limit = REWORK_MAX;
    for (let attempt = 1; ; attempt++) {
      const profile = bands.implement[Math.min(attempt, bands.implement.length) - 1]; // the last profile repeats
      const imp = await step('implement', `implement-${count('implement')}`, cmd('implement', { attempt, pr: st.pr }, findings && { findings }), profile);
      if (imp.outcome === 'stopped') return route(imp.cause, imp.note);
      const reviews = await codeReviews(imp.sha, tests);
      if (reviews.every(r => passes(r.review))) return 'ready';
      history.push({ attempt, sha: imp.sha, reviews: reviews.map(r => ({ stage: r.stage, verdict: r.review.verdict, findings: r.review.findings })) });
      findings = reviews.filter(r => !passes(r.review)).flatMap(r => blockers(r.review));
      if (attempt < limit) continue;
      if (attempt > REWORK_MAX) throw new Ended('escalated', 'attempts_exhausted', `still failing after ${attempt} attempts`);

      const d = await step('diagnose', `diagnose-${count('diagnose')}`, cmd('diagnose', { pr: st.pr }, { attempts: history }), bands.diagnose);
      if (d.cause === 'D') { limit += DETERMINATE_EXTRA; causes.push({ cause: 'D', note: d.evidence }); continue; }
      if (d.cause === 'F') {
        const t = await step('review', `tiebreak-${count('tiebreak')}`, cmd('review', { mode: 'code', pr: st.pr, sha: imp.sha, slot: 'tiebreak' },
          { tests_sha: tests.sha, tests: tests.files }), bands.review);
        const ships = reviews.filter(r => passes(r.review)).length + (passes(t) ? 1 : 0);
        if (ships >= reviews.length) return 'ready';
        return route('B', `the tie-break reviewer didn't ship it: ${d.evidence}`);
      }
      return route(d.cause, d.evidence);
    }
  }

  async function flow(): Promise<Ended> {
    let phase: 'design' | 'acceptance' | 'implement' = 'design', ctx: unknown, bounces = 0, tests: Tests | undefined;
    const go = (r: Route) => {
      if (r.count && ++bounces > BOUNCES_MAX) throw new Ended('escalated', 'bounces_exhausted', `routed back more than ${BOUNCES_MAX} times`);
      phase = r.to; ctx = r.ctx;
    };
    for (;;) {
      if (phase === 'design') { await designPhase(ctx); phase = 'acceptance'; ctx = undefined; }
      if (phase === 'acceptance') {
        const t = await testsPhase(ctx);
        if ('to' in t) { go(t); continue; }
        tests = t; phase = 'implement'; ctx = undefined;
      }
      const out = await implementLoop(tests!);
      if (out === 'ready') return new Ended('ready', '', '');
      go(out);
    }
  }

  let end: Ended;
  try { end = await flow(); } catch (e) { if (!(e instanceof Ended)) throw e; end = e; }

  const finishReport = report({ outcome: end.outcome, steps: st.steps,
    causes: end.outcome === 'ready' ? causes : [...causes, { cause: end.cause, note: end.note }] });
  let url: string;
  try {
    url = (await step('finish', 'finish', cmd('finish', { outcome: end.outcome, pr: st.pr }, { report: finishReport }), bands.finish)).url;
  } catch (e) {
    if (e instanceof Ended) throw ApplicationFailure.nonRetryable(e.note, e.outcome);
    throw e;
  }
  if (end.outcome === 'ready') return { outcome: end.outcome, pr: st.pr, url };
  throw ApplicationFailure.nonRetryable(`${end.cause}: ${end.note}`, end.outcome);
}
