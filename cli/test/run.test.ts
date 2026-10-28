import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoUrl, taskPrompt } from '../src/run.ts';

test('the repo URL is https://github.com/owner/repo whatever the remote form', () => {
  for (const remote of [
    'https://github.com/librepod/marketplace',
    'https://github.com/librepod/marketplace.git\n',
    'git@github.com-work:librepod/marketplace.git',
    'ssh://git@github.com/librepod/marketplace.git',
  ]) assert.equal(repoUrl(remote), 'https://github.com/librepod/marketplace', remote);
  assert.throws(() => repoUrl('marketplace'));
});

test('the task prompt names the issue, the branch, the run and the PR body', () => {
  const p = taskPrompt(12, 'k3x9qa');
  for (const s of ['gh issue view 12', 'f8/k3x9qa', 'gh pr create --draft', 'Run: k3x9qa', 'Fixes #12', "PR's URL"])
    assert.ok(p.includes(s), s);
});
