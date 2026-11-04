import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.ts';
import { plan, build, review, fix } from './prompts.ts';

export interface RunInput { runId: string; repo: string; issue: number }

// One attempt each: retries come in M4, heartbeats in M2.
const { createSandbox, startStep, deleteSandbox } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m', retry: { maximumAttempts: 1 },
});
const { pollStep } = proxyActivities<typeof activities>({ startToCloseTimeout: '2h', retry: { maximumAttempts: 1 } });

const MAX_FIXES = 2; // ORC-3; per-run config comes when routes need different caps (ORC-11)

// M1's runWorkflow body, around one step's own sandbox (M5 D1).
async function step(repo: string, runId: string, stage: string, prompt: string, role: activities.Role) {
  const stepId = `${runId}.${stage}.1`;
  try {
    const ip = await createSandbox(runId, stage, repo);
    await startStep(ip, { stepId, runId, prompt, repo: { url: repo, branch: `factory8/${runId}` } }, role);
    const exit = await pollStep(ip, stepId);
    if (exit.status === 'done') return exit;
    // needs_input fails the run too: waiting for an answer comes in M3.
    throw ApplicationFailure.nonRetryable(exit.status === 'failed' ? exit.reason : exit.question, exit.status);
  } finally {
    await deleteSandbox(runId, stage);
  }
}

// The SDLC run: plan → build → review, fix rounds, ending at a PR the human merges or not (M5 D1–D4).
export async function sdlcWorkflow({ runId, repo, issue }: RunInput) {
  await step(repo, runId, 'plan', plan(runId, issue), 'author');
  await step(repo, runId, 'build', build(runId, issue), 'author');
  for (let n = 1; ; n++) {
    const exit = await step(repo, runId, `review-${n}`, review(runId, issue), 'reviewer');
    // The verdict rides the summary's last line (D3), markdown stripped; the human gate at the PR catches a wrong call.
    const verdict = exit.summary.trim().split('\n').map(l => l.trim()).filter(Boolean).at(-1)
      ?.replace(/[*`_]/g, '').match(/^Verdict: (ready|changes)\b/)?.[1];
    if (!verdict) throw ApplicationFailure.nonRetryable('the review summary has no verdict', 'no_verdict');
    if (verdict === 'ready') return exit;
    if (n > MAX_FIXES) throw ApplicationFailure.nonRetryable('the review still asks for changes', 'changes_requested');
    await step(repo, runId, `fix-${n}`, fix(runId, issue), 'author');
  }
}

export { shipWorkflow } from './ship.ts';
