import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, repoUrl, resultLine, startOf } from '../src/run.ts';

test('the repo URL is https://github.com/owner/repo whatever the remote form, lowercased', () => {
  for (const remote of [
    'https://github.com/librepod/marketplace',
    'https://github.com/librepod/marketplace.git\n',
    'git@github.com-work:librepod/marketplace.git',
    'ssh://git@github.com/librepod/marketplace.git',
  ]) assert.equal(repoUrl(remote), 'https://github.com/librepod/marketplace', remote);
  assert.equal(repoUrl('git@github.com:Factory8/Factory8.git'), 'https://github.com/factory8/factory8');
  assert.throws(() => repoUrl('marketplace'));
});

test('the arguments: run, run --flow <name>, a malformed flow name, and answer', () => {
  assert.deepEqual(parseArgs(['run', '12']), { cmd: 'run', flow: 'sdlc', issue: 12 });
  assert.deepEqual(parseArgs(['run', '--flow', 'ship', '12']), { cmd: 'run', flow: 'ship', issue: 12 });
  assert.deepEqual(parseArgs(['run', '--flow', 'gated', '12']), { cmd: 'run', flow: 'gated', issue: 12 });
  assert.deepEqual(parseArgs(['run', '--flow', 'fixBug2', '12']), { cmd: 'run', flow: 'fixBug2', issue: 12 });
  assert.deepEqual(parseArgs(['answer', 'k3x9qa', 'use PostgreSQL']), { cmd: 'answer', run: 'k3x9qa', text: 'use PostgreSQL' });
  assert.deepEqual(parseArgs(['answer', 'k3x9qa', 'use', 'PostgreSQL']), { cmd: 'answer', run: 'k3x9qa', text: 'use PostgreSQL' });
  for (const bad of [[], ['run'], ['run', 'x'], ['run', '0'], ['run', '--flow', '9-x', '12'], ['run', '--flow', 'Gated', '12'],
    ['run', '--flow', 'fix-bug', '12'], ['run', '--flow', 'ship'], ['run', '--flow'], ['answer', 'k3x9qa'], ['ship', '12']])
    assert.equal(parseArgs(bad), undefined, bad.join(' '));
});

test('a run started once any workflow task completed, even after a failed one; else it can\'t start', () => {
  const completed = { workflowTaskCompletedEventAttributes: {} };
  const failed = { workflowTaskFailedEventAttributes: { failure: { message: 'no such function' } } };
  assert.equal(startOf([{}, completed]), true);
  assert.equal(startOf([{}, failed]), 'no such function');
  assert.equal(startOf([{}, failed, {}, completed]), true, 'the retry completed on another worker');
  assert.equal(startOf([{}]), undefined, 'the first task is pending');
});

test('a result prints as its url, else its summary, else JSON', () => {
  assert.equal(resultLine({ outcome: 'ready', pr: 40, url: 'https://github.com/factory8/factory8/pull/40' }), 'https://github.com/factory8/factory8/pull/40');
  assert.equal(resultLine({ seq: 3, status: 'done', summary: 'Verdict: ready · https://github.com/o/r/pull/7' }), 'Verdict: ready · https://github.com/o/r/pull/7');
  assert.equal(resultLine({ url: 7, summary: 's' }), 's');
  assert.equal(resultLine({ files: 2 }), '{"files":2}');
});
