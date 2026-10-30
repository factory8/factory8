// The Temporal worker (M1 design D1, D8): TEMPORAL_ADDRESS, F8_MODEL, F8_REVIEW_MODEL and F8_IMAGES come from its Deployment.
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.ts';

// DEP-11: a review never runs on the author's model, so no silent fallback (M5 D7).
if (!process.env.F8_REVIEW_MODEL || process.env.F8_REVIEW_MODEL === process.env.F8_MODEL)
  throw new Error('F8_REVIEW_MODEL must be set and differ from F8_MODEL');

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const worker = await Worker.create({
  connection,
  taskQueue: 'factory8',
  workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
  activities,
});
await worker.run();
