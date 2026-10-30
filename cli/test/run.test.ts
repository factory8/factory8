import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, repoUrl } from '../src/run.ts';

test('the repo URL is https://github.com/owner/repo whatever the remote form', () => {
  for (const remote of [
    'https://github.com/librepod/marketplace',
    'https://github.com/librepod/marketplace.git\n',
    'git@github.com-work:librepod/marketplace.git',
    'ssh://git@github.com/librepod/marketplace.git',
  ]) assert.equal(repoUrl(remote), 'https://github.com/librepod/marketplace', remote);
  assert.throws(() => repoUrl('marketplace'));
});

test('the arguments: run, run --flow ship, an unknown flow, and answer', () => {
  assert.deepEqual(parseArgs(['run', '12']), { cmd: 'run', flow: 'sdlc', issue: 12 });
  assert.deepEqual(parseArgs(['run', '--flow', 'ship', '12']), { cmd: 'run', flow: 'ship', issue: 12 });
  assert.deepEqual(parseArgs(['answer', 'k3x9qa', 'use PostgreSQL']), { cmd: 'answer', run: 'k3x9qa', text: 'use PostgreSQL' });
  assert.deepEqual(parseArgs(['answer', 'k3x9qa', 'use', 'PostgreSQL']), { cmd: 'answer', run: 'k3x9qa', text: 'use PostgreSQL' });
  for (const bad of [[], ['run'], ['run', 'x'], ['run', '0'], ['run', '--flow', 'nope', '12'], ['run', '--flow', 'ship'], ['answer', 'k3x9qa'], ['ship', '12']])
    assert.equal(parseArgs(bad), undefined, bad.join(' '));
});
