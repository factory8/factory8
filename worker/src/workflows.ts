import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.ts';
import type { StepRequest } from '../../adapter/src/types.ts';

export interface RunInput { runId: string; repo: string; prompt: string; profile?: StepRequest['profile'] }

// One attempt each: retries come in M4, heartbeats in M2.
const { createSandbox, startStep, deleteSandbox } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m', retry: { maximumAttempts: 1 },
});
const { pollStep } = proxyActivities<typeof activities>({ startToCloseTimeout: '2h', retry: { maximumAttempts: 1 } });

// A run of one build step in its own sandbox (run-workflow spec, M1 design D1). The PVC outlives it.
export async function runWorkflow({ runId, repo, prompt, profile }: RunInput) {
  const stepId = `${runId}.build.1`;
  try {
    const ip = await createSandbox(runId, repo);
    await startStep(ip, { stepId, runId, prompt, profile, repo: { url: repo, branch: `f8/${runId}` } });
    const exit = await pollStep(ip, stepId);
    if (exit.status === 'done') return exit;
    // needs_input fails the run too: waiting for an answer comes in M3.
    throw ApplicationFailure.nonRetryable(exit.status === 'failed' ? exit.reason : exit.question, exit.status);
  } finally {
    await deleteSandbox(runId);
  }
}
