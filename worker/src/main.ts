// The Temporal worker (M1 design D1, D8): TEMPORAL_ADDRESS, FACTORY8_MODEL, FACTORY8_REVIEW_MODEL and FACTORY8_IMAGES come from its Deployment.
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.ts';

// DEP-11: a review never runs on the author's model, so no silent fallback (M5 D7).
if (!process.env.FACTORY8_REVIEW_MODEL || process.env.FACTORY8_REVIEW_MODEL === process.env.FACTORY8_MODEL)
  throw new Error('FACTORY8_REVIEW_MODEL must be set and differ from FACTORY8_MODEL');

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const worker = await Worker.create({
  connection,
  taskQueue: 'factory8',
  workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
  activities,
});
await worker.run();
