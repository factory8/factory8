import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workdir } from '../src/workdir.ts';

test('with no workdir, the checkout is the URL\'s last two segments', () => {
  assert.equal(workdir('https://github.com/librepod/marketplace.git'), '/f8/librepod/marketplace');
  assert.equal(workdir('https://github.com/factory8/factory8'), '/f8/factory8/factory8');
  assert.equal(workdir('/tmp/f8-adapter-x1Yz9a/origin.git'), '/f8/f8-adapter-x1Yz9a/origin');
  assert.equal(workdir('https://github.com/factory8/factory8', '# no workdir here\nother: x\n'), '/f8/factory8/factory8');
});

test('workdir in project.yaml overrides the URL, with comments, quotes and a trailing comment', () => {
  const url = 'https://gitlab.example.com/platform/team/shop.git';
  for (const yaml of ['workdir: acme/shop', '# where it goes\n\nworkdir: acme/shop\n# done\n', 'workdir: "acme/shop"',
    "workdir: 'acme/shop'  # pinned before the move", 'workdir:acme/shop\r\n'])
    assert.equal(workdir(url, yaml), '/f8/acme/shop', JSON.stringify(yaml));
  assert.equal(workdir(url, '  workdir: acme/shop'), '/f8/team/shop', 'only a top-level line');
});

test('a refused name throws a reason that names it; from the URL, the reason says to set workdir', () => {
  for (const owner of ['home', 'state', 'plugin'])
    assert.throws(() => workdir(`https://github.com/${owner}/dotfiles`),
      new RegExp(`"${owner}/dotfiles" from the repo URL .*set workdir in \\.factory8/project\\.yaml`));
  for (const bad of ['home/x', 'state/x', 'plugin/x', 'shop', 'a/b/c', '../etc', 'acme/..', '.x/shop', 'acme/.github', '-x/shop', 'acme/sh op', ''])
    assert.throws(() => workdir('https://github.com/factory8/factory8', `workdir: ${bad}`),
      (e: Error) => e.message.startsWith(`workdir ${JSON.stringify(bad)} in .factory8/project.yaml is refused`), bad);
});
