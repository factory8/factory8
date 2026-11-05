import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskQueue } from '../src/queue.ts';

test('taskQueue: a repo URL gives factory8/<owner>/<repo>', () => {
  assert.equal(taskQueue('https://github.com/librepod/marketplace'), 'factory8/librepod/marketplace');
  assert.equal(taskQueue('https://github.com/factory8/factory8'), 'factory8/factory8/factory8');
});

test('taskQueue throws on anything but a lowercase GitHub repo URL', () => {
  for (const repo of ['https://github.com/Factory8/factory8', 'https://github.com/o/r/', 'http://github.com/o/r',
    'https://gitlab.com/o/r', 'https://github.com/o', 'git@github.com:o/r.git', ''])
    assert.throws(() => taskQueue(repo), /isn't a lowercase GitHub repo URL/, repo);
});
