// A run's building blocks, for the ship run and a project's own flows (M7 design D3): a step in its own sandbox,
// a wait for a human that holds no pod, and the run's `state` query. A project's flow imports only this and @temporalio/workflow.
import { ApplicationFailure, condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from './activities.ts';
import type { StepRequest } from '../../adapter/src/types.ts';
import type { RunInput } from './workflows.ts';

export type { RunInput };

// One attempt each, as in sdlcWorkflow: retries come in M4.
const { createSandbox, startStep, answerStep, deleteSandbox } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m', retry: { maximumAttempts: 1 },
});
const { pollStep } = proxyActivities<typeof activities>({ startToCloseTimeout: '2h', retry: { maximumAttempts: 1 } });

const answer = defineSignal<[string]>('answer');
const state = defineQuery<RunState>('state');

export interface StepRecord { stage: string; model?: string; result: unknown }
export interface RunState { stage: string; question?: string; steps: StepRecord[] }
export interface StepOptions<T> {
  profile?: activities.Profile; // wins over the role, whose model the activity picks (M5 D7)
  role?: activities.Role;
  plugin?: StepRequest['plugin'];
  parse?: (summary: string) => T; // a throw ends the step unrecorded
}

// A stage names the step's pod, PVC and step ID, so it's a DNS label used once per run.
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

// Called once at the workflow's start; `more` is the workflow's own state, shown by the query with the rest.
export function run<X extends object = object>({ runId, repo }: RunInput, more = {} as X) {
  const st = { stage: '', steps: [], ...more } as RunState & X;
  const answers: string[] = [];
  const used = new Set<string>();
  setHandler(state, () => st);
  setHandler(answer, a => { answers.push(a); });

  // The run's wait for a human: no sandbox exists while it lasts (ORC-5, M6 D10).
  async function ask(question: string) {
    // One question at a time: `state` has one slot, and `f8 answer` names the run, not the step.
    if (st.question !== undefined) throw ApplicationFailure.nonRetryable('a question is already waiting', 'bad_ask');
    st.question = question;
    await condition(() => answers.length > 0);
    st.question = undefined;
    return answers.shift()!;
  }

  // One step in its own sandbox: create, start, poll, delete in `finally`; a question waits without a pod (M6 D1, D10).
  async function step<T = string>(stage: string, prompt: string, opts: StepOptions<T> = {}): Promise<T> {
    if (!DNS_LABEL.test(stage) || used.has(stage))
      throw ApplicationFailure.nonRetryable(`stage ${JSON.stringify(stage)} must be a DNS label not used before in the run`, 'bad_stage');
    used.add(stage);
    st.stage = stage;
    const stepId = `${runId}.${stage}.1`;
    try {
      let ip = await createSandbox(runId, stage, repo), seen = 0;
      await startStep(ip, { stepId, runId, prompt, repo: { url: repo, branch: `factory8/${runId}` }, plugin: opts.plugin, profile: opts.profile }, opts.role);
      for (;;) {
        const exit = await pollStep(ip, stepId, seen);
        seen = exit.seq; // the step's log keeps this exit, so the poll after an answer starts past it
        if (exit.status === 'done') {
          const result = opts.parse ? opts.parse(exit.summary) : exit.summary as T;
          st.steps.push(opts.profile ? { stage, model: opts.profile.model, result } : { stage, result });
          return result;
        }
        if (exit.status === 'failed') throw ApplicationFailure.nonRetryable(`${stage}: ${exit.reason}`, 'failed');
        await deleteSandbox(runId, stage); // the PVC stays, and so does the session
        const a = await ask(exit.question);
        ip = await createSandbox(runId, stage, repo);
        await answerStep(ip, stepId, a);
      }
    } finally {
      await deleteSandbox(runId, stage);
    }
  }

  return { state: st, ask, step };
}
