// The Temporal worker (M1 design D1, D8): TEMPORAL_ADDRESS, F8_MODEL and F8_IMAGES come from its Deployment.
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.ts';

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const worker = await Worker.create({
  connection,
  taskQueue: 'factory8',
  workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
  activities,
});
await worker.run();
