// Bundles a worker's workflows at image build (M7 design D1, D4): node bundle.ts <entry> <out>.
// The entry and a project's workflows sit outside this package, so webpack also looks in our own node_modules.
import { writeFile } from 'node:fs/promises';
import { bundleWorkflowCode } from '@temporalio/worker';

const [entry, out] = process.argv.slice(2);
const nodeModules = new URL('../../node_modules', import.meta.url).pathname;
const { code } = await bundleWorkflowCode({
  workflowsPath: entry,
  webpackConfigHook: config => ({ ...config, resolve: { ...config.resolve, modules: [...config.resolve!.modules!, nodeModules] } }),
});
await writeFile(out, code);
