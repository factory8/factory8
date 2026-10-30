// Step commands, results and the run's report as pure functions (M6 design D3, D6, D12), so the workflow can call them.

export type Skill = 'design' | 'acceptance' | 'implement' | 'review' | 'diagnose' | 'finish';
export const CAUSES = 'ABCDEFGHI';
export type Severity = 'blocker' | 'critical' | 'high' | 'medium' | 'low';
export interface Finding { severity: Severity; message: string; file?: string; line?: number }
export type Stopped = { outcome: 'stopped'; cause: string; note: string };
export type Pushed = { outcome: 'pushed'; sha: string; pr?: number; risk?: 'low' | 'high'; tests?: string[] };
export interface Review { verdict: 'SHIP' | 'SHIP_WITH_FIXES' | 'DO_NOT_SHIP'; determinate_fix: boolean; findings: Finding[]; risk?: 'high' }
export interface Diagnosis { cause: string; evidence: string }
export interface Finished { ok: true; url: string }
export interface Results { design: Pushed | Stopped; acceptance: Pushed | Stopped; implement: Pushed | Stopped;
  review: Review; diagnose: Diagnosis; finish: Finished }

const SEVERITIES = ['blocker', 'critical', 'high', 'medium', 'low'];
const VERDICTS = ['SHIP', 'SHIP_WITH_FIXES', 'DO_NOT_SHIP'];
const STOPS = { design: 'C', acceptance: 'BC', implement: 'ABC' } as const; // the causes each author stage allows
export const blocking = (f: Finding) => f.severity === 'blocker' || f.severity === 'critical';
// An attempt passes unless its review blocks it: only blocking findings send work back (ship-workflow spec).
export const passes = (r: Review) => r.verdict !== 'DO_NOT_SHIP';

const str = (v: unknown) => typeof v === 'string' && v !== '';

// The step's result is the last non-empty line of its summary, as JSON; backticks around it are forgiven.
export function parseResult<K extends Skill>(kind: K, summary: string): Results[K] {
  const line = summary.trim().split('\n').map(l => l.trim()).filter(Boolean).at(-1)?.replace(/^`+|`+$/g, '');
  let r: any;
  try { r = JSON.parse(line ?? ''); } catch { throw new Error(`${kind}: the last line isn't JSON`); }
  const bad = (why: string): never => { throw new Error(`${kind}: ${why}`); };
  if (typeof r !== 'object' || r === null) return bad('the result isn\'t an object');
  if (kind === 'design' || kind === 'acceptance' || kind === 'implement') {
    if (r.outcome === 'stopped') {
      if (!(STOPS as Record<string, string>)[kind].includes(r.cause)) bad(`cause ${r.cause} isn't allowed`);
      if (!str(r.note)) bad('a stop needs a note');
    } else if (r.outcome === 'pushed') {
      if (!str(r.sha)) bad('no sha');
      if (kind === 'design' && !(Number.isInteger(r.pr) && (r.risk === 'low' || r.risk === 'high'))) bad('a design needs pr and risk');
      if (kind === 'acceptance' && !(Array.isArray(r.tests) && r.tests.length && r.tests.every(str))) bad('acceptance needs tests');
    } else bad('outcome is neither pushed nor stopped');
  } else if (kind === 'review') {
    if (!VERDICTS.includes(r.verdict)) bad('unknown verdict');
    if (typeof r.determinate_fix !== 'boolean') bad('no determinate_fix');
    if (!Array.isArray(r.findings) || !r.findings.every((f: Finding) => SEVERITIES.includes(f?.severity) && str(f.message))) bad('invalid findings');
    if (r.risk !== undefined && r.risk !== 'high') bad('risk can only be high');
    const blocks = r.findings.some(blocking);
    if (r.verdict === 'DO_NOT_SHIP' ? !blocks : blocks) bad(`${r.verdict} doesn't fit its findings`);
  } else if (kind === 'diagnose') {
    if (!(r.cause?.length === 1 && CAUSES.includes(r.cause)) || !str(r.evidence)) bad('needs one cause A to I, and evidence');
  } else if (r.ok !== true || !str(r.url)) bad('needs ok and url');
  return r;
}

// `/factory8:<skill> <issue> k=v …`, then longer context as one JSON line (factory8-plugin spec).
export const command = (skill: Skill, issue: number, args: Record<string, string | number | undefined>, context?: unknown) =>
  `/factory8:${skill} ${issue}${Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}=${v}`).join('')}` +
  (context === undefined ? '' : `\n${JSON.stringify(context)}`);

export interface StepRecord { stage: string; model: string; result: unknown }
export interface RunReport { outcome: string; steps: StepRecord[]; causes: { cause: string; note: string }[] }

// What the finish step posts: the outcome, the steps, the causes and the non-blocking findings as follow-ups (D12).
export function report({ outcome, steps, causes }: RunReport) {
  const lines = [`## Factory8 run: ${outcome}`, '', '### Steps',
    ...steps.map(s => `- \`${s.stage}\` (${s.model}): \`${JSON.stringify(s.result)}\``)];
  if (causes.length) lines.push('', '### Causes', ...causes.map(c => `- ${c.cause}: ${c.note}`));
  const followUps = steps.flatMap(s => ((s.result as Partial<Review>).findings ?? []).filter(f => !blocking(f)).map(f => ({ ...f, stage: s.stage })));
  if (followUps.length) lines.push('', '### Follow-ups', ...followUps.map(f =>
    `- ${f.severity} (${f.stage}): ${f.message}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''}`));
  return lines.join('\n');
}
