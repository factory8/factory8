// Workflows for flow.test.ts, built on flow.ts as a project's flow is.
import { run, type RunInput } from '../src/flow.ts';

// A plan with a profile and a parse, a human's go-ahead, then a build with a role.
export async function gateFlow(input: RunInput) {
  const { ask, step } = run(input);
  const plan = await step('plan', 'make a plan', { profile: { model: 'p' }, parse: s => s.toUpperCase() });
  if (await ask(`build ${plan}?`) !== 'go') return 'stopped';
  return step('build', 'build it', { role: 'author' });
}

// One step for each stage it's given.
export async function stagesFlow(input: RunInput & { stages: string[] }) {
  const { step } = run(input);
  for (const s of input.stages) await step(s, `do ${s}`);
}

// The steps for its stages all at once, to test the one-question limit; flows run steps one at a time (flow.ts, `step`).
export async function parallelFlow(input: RunInput & { stages: string[] }) {
  const { step } = run(input);
  await Promise.all(input.stages.map(s => step(s, `do ${s}`)));
}
