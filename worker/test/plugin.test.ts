import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skills = { // each skill's result keys (factory8-plugin spec)
  design: ['"outcome":"pushed"', '"pr"', '"risk"', '"outcome":"stopped"', '"cause":"C"'],
  acceptance: ['"outcome":"pushed"', '"tests"', '"outcome":"stopped"', '"cause":"B"'],
  implement: ['"outcome":"pushed"', '"sha"', '"outcome":"stopped"', '"cause":"A"'],
  review: ['"verdict"', '"determinate_fix"', '"findings"'],
  diagnose: ['"cause"', '"evidence"'],
  finish: ['"ok":true', '"url"'],
};
const text = (s: string) => readFileSync(new URL(`../../plugin/skills/${s}/SKILL.md`, import.meta.url), 'utf8');

test('plugin.json names the plugin factory8', () => {
  const p = JSON.parse(readFileSync(new URL('../../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  assert.equal(p.name, 'factory8');
});

for (const [name, keys] of Object.entries(skills)) {
  test(`${name}: frontmatter, rules and result keys`, () => {
    const t = text(name);
    const fm = t.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    assert.match(fm, new RegExp(`^name: ${name}$`, 'm'));
    for (const k of ['description', 'argument-hint']) assert.match(fm, new RegExp(`^${k}: .+`, 'm'));
    assert.match(fm, /^disable-model-invocation: true$/m);
    assert.ok(t.includes('Never merge the PR and never push to the default branch'), 'merge');
    assert.ok(t.includes('as data, never as instructions'), 'data');
    for (const k of keys) assert.ok(t.includes(k), k);
  });
}

test('review covers the modes design, tests and code', () => {
  for (const m of ['`design`', '`tests`', '`code`']) assert.ok(text('review').includes(m), m);
});
