// The Temporal worker (M1 design D1, D8): TEMPORAL_ADDRESS, FACTORY8_MODEL, FACTORY8_REVIEW_MODEL and FACTORY8_IMAGES come from its Deployment.
// It serves one task queue for each repo in FACTORY8_IMAGES (M7 design D2).
import { NativeConnection, Worker, bundleWorkflowCode } from '@temporalio/worker';
import * as activities from './activities.ts';
import { taskQueue } from './queue.ts';

// No silent fallback: the reviewer's model is chosen, even when it's the author's (M5 D7, DEP-11).
for (const v of ['FACTORY8_MODEL', 'FACTORY8_REVIEW_MODEL']) if (!process.env[v]) throw new Error(`${v} must be set`);
const repos = Object.keys(JSON.parse(process.env.FACTORY8_IMAGES || '{}'));
if (!repos.length) throw new Error('FACTORY8_IMAGES must name at least one repo');
const queues = repos.map(taskQueue);

// Bundled at the image's build (M7 D4); without one, once here rather than once per queue.
const workflowBundle = process.env.FACTORY8_WORKFLOW_BUNDLE
  ? { codePath: process.env.FACTORY8_WORKFLOW_BUNDLE }
  : await bundleWorkflowCode({ workflowsPath: new URL('./workflows.ts', import.meta.url).pathname });
const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const workers = await Promise.all(queues.map(q => Worker.create({
  connection, taskQueue: q, workflowBundle, activities,
  workflowFailureErrorTypes: { '*': ['Error'] }, // an error in a workflow's code fails the run, not its task forever
})));
// A worker that fails ends the process, and Kubernetes restarts it.
await Promise.all(workers.map(w => w.run()));
