import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoUrl } from '../src/run.ts';

test('the repo URL is https://github.com/owner/repo whatever the remote form', () => {
  for (const remote of [
    'https://github.com/librepod/marketplace',
    'https://github.com/librepod/marketplace.git\n',
    'git@github.com-work:librepod/marketplace.git',
    'ssh://git@github.com/librepod/marketplace.git',
  ]) assert.equal(repoUrl(remote), 'https://github.com/librepod/marketplace', remote);
  assert.throws(() => repoUrl('marketplace'));
});
