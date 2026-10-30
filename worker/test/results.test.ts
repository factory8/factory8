import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command, parseResult, report } from '../src/results.ts';

const J = JSON.stringify;
const finding = (severity: string) => ({ severity, message: 'm' });
const rev = (verdict: string, ...severities: string[]) => J({ verdict, determinate_fix: false, findings: severities.map(finding) });

test('parseResult reads the last line, with backticks forgiven', () => {
  assert.deepEqual(parseResult('implement', `Done.\n\`${J({ outcome: 'pushed', sha: 'abc' })}\`\n\n`), { outcome: 'pushed', sha: 'abc' });
});

test('parseResult accepts every kind, valid', () => {
  parseResult('design', J({ outcome: 'pushed', sha: 'a', pr: 18, risk: 'high' }));
  parseResult('design', J({ outcome: 'stopped', cause: 'C', note: 'too big' }));
  parseResult('acceptance', J({ outcome: 'pushed', sha: 'a', tests: ['t.ts'] }));
  parseResult('acceptance', J({ outcome: 'stopped', cause: 'B', note: 'n' }));
  parseResult('implement', J({ outcome: 'stopped', cause: 'A', note: 'n' }));
  parseResult('review', rev('SHIP', 'medium'));
  parseResult('review', rev('SHIP_WITH_FIXES', 'high'));
  parseResult('review', rev('DO_NOT_SHIP', 'blocker', 'low'));
  parseResult('diagnose', J({ cause: 'D', evidence: 'src/a.ts:40' }));
  parseResult('finish', J({ ok: true, url: 'https://github.com/o/r/pull/18' }));
});

test('parseResult rejects what the stage doesn\'t allow', () => {
  const bad: [Parameters<typeof parseResult>[0], string][] = [
    ['implement', 'all done'], // not JSON
    ['review', rev('SHIP', 'critical')],
    ['review', rev('SHIP_WITH_FIXES', 'blocker')],
    ['review', rev('DO_NOT_SHIP', 'high')],
    ['review', J({ verdict: 'MAYBE', determinate_fix: false, findings: [] })],
    ['design', J({ outcome: 'stopped', cause: 'A', note: 'n' })], // design may only stop with C
    ['acceptance', J({ outcome: 'stopped', cause: 'A', note: 'n' })],
    ['implement', J({ outcome: 'stopped', cause: 'D', note: 'n' })],
    ['implement', J({ outcome: 'stopped', cause: 'A' })], // no note
    ['design', J({ outcome: 'pushed', sha: 'a' })], // no pr or risk
    ['acceptance', J({ outcome: 'pushed', sha: 'a', tests: [] })],
    ['diagnose', J({ cause: 'J', evidence: 'e' })],
    ['diagnose', J({ cause: 'AB', evidence: 'e' })],
    ['finish', J({ ok: false, url: 'u' })],
  ];
  for (const [kind, summary] of bad) assert.throws(() => parseResult(kind, summary), new RegExp(`^Error: ${kind}:`), `${kind}: ${summary}`);
});

test('command renders the first line and the JSON context line', () => {
  assert.equal(command('review', 12, { run: 'k3x9qa', mode: 'code', pr: 18, sha: 'abc123', slot: 1 }),
    '/factory8:review 12 run=k3x9qa mode=code pr=18 sha=abc123 slot=1');
  assert.equal(command('implement', 12, { run: 'k3x9qa', attempt: 2, pr: undefined }, { findings: [finding('blocker')] }),
    `/factory8:implement 12 run=k3x9qa attempt=2\n{"findings":[{"severity":"blocker","message":"m"}]}`);
});

test('report holds the outcome, each step\'s model and result, the causes, and non-blocking findings as follow-ups', () => {
  const r = { findings: [{ severity: 'medium', message: 'rename x', file: 'src/a.ts', line: 3 }, finding('critical')] };
  const text = report({
    outcome: 'escalated',
    steps: [{ stage: 'design-1', model: 'glm-5.3', result: { outcome: 'pushed', sha: 'a' } }, { stage: 'code-review-1', model: 'other', result: r }],
    causes: [{ cause: 'D', note: 'attempts_exhausted' }],
  });
  for (const s of ['escalated', '`design-1` (glm-5.3)', '"sha":"a"', '`code-review-1` (other)', '- D: attempts_exhausted',
    '### Follow-ups', '- medium (code-review-1): rename x (src/a.ts:3)'])
    assert.ok(text.includes(s), s);
  assert.ok(!text.split('### Follow-ups')[1].includes('critical'), 'a blocking finding is not a follow-up');
});
