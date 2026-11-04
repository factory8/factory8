// The Temporal worker (M1 design D1, D8): TEMPORAL_ADDRESS, FACTORY8_MODEL, FACTORY8_REVIEW_MODEL and FACTORY8_IMAGES come from its Deployment.
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.ts';

// No silent fallback: the reviewer's model is chosen, even when it's the author's (M5 D7, DEP-11).
if (!process.env.FACTORY8_REVIEW_MODEL) throw new Error('FACTORY8_REVIEW_MODEL must be set');

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const worker = await Worker.create({
  connection,
  taskQueue: 'factory8',
  workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
  activities,
});
await worker.run();
