import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test("worker.yaml header: each repo's sandbox tag goes in the Deployment that serves it", () => {
  const yaml = read('deploy/worker.yaml');
  assert.ok(
    yaml.includes(
      "# Image tags are Nix hashes: after `nix build .#worker-image`, import the image and update its tag here; each repo's sandbox tag (`.#sandbox-image`) goes in the Deployment that serves the repo.",
    ),
    'the header names where each tag goes',
  );
  assert.ok(!yaml.includes('Both image tags'), 'the stale wording is gone');
});

test('AGENTS.md: the worker-image bullet names where each tag goes', () => {
  const md = read('AGENTS.md');
  assert.ok(
    md.includes(
      "After importing, the shared worker's tag goes in `deploy/worker.yaml`, and a repo's sandbox tag goes in the Deployment that serves the repo (this repo's: `deploy/projects/factory8.yaml`).",
    ),
    'the bullet names where each tag goes',
  );
  assert.ok(!md.includes('put its new tag in'), 'the stale wording is gone');
});
