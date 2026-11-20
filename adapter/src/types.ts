// The adapter's HTTP contract (agent-adapter spec), shared with the worker through `import type` (M1 design D7).
export interface StepRequest {
  stepId: string;
  runId: string;
  prompt: string;
  profile: { vendor: 'claude-code'; model: string; effort?: string };
  repo: { url: string; branch: string };
  plugin?: { url: string; ref: string }; // a Factory8 plugin repo, checked out at `ref`
}
export type EventBody =
  | { type: 'progress'; text: string }
  | { type: 'exit'; status: 'done'; summary: string }
  | { type: 'exit'; status: 'failed'; reason: string }
  | { type: 'exit'; status: 'needs_input'; question: string };
export type StepEvent = { seq: number; at: string; stepId: string } & EventBody;
