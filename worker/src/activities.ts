// The worker's only jobs: the run's sandbox and the adapter (M1 design D1, D2). No forge calls.
import * as k8s from '@kubernetes/client-node';
import { ApplicationFailure, Context } from '@temporalio/activity';
import type { StepEvent, StepRequest } from '../../adapter/src/types.ts';

export type Exit = Extract<StepEvent, { type: 'exit' }>;

const NS = 'f8-sandboxes', PORT = 7070;
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const core = kc.makeApiClient(k8s.CoreV1Api);
const ignore = (code: number) => (e: { code?: number }) => { if (e.code !== code) throw e; };
const labels = (runId: string, stage: string) => ({ app: 'f8-sandbox', 'f8/run': runId, 'f8/step': stage });

// The project template: the admin-owned settings of every sandbox (DEP-6).
// The name is f8-<runId>-<stage>, at most 18 chars: runIds are 6, stages top out at review-3 (M5 D2).
export const sandboxPod = (runId: string, stage: string, image: string): k8s.V1Pod => ({
  metadata: { name: `f8-${runId}-${stage}`, labels: labels(runId, stage) },
  spec: {
    runtimeClassName: 'kata',
    containers: [{
      name: 'adapter',
      image,
      imagePullPolicy: 'Never', // imported onto the node, tagged with its Nix hash (D3)
      ports: [{ containerPort: PORT }],
      envFrom: [{ secretRef: { name: 'f8-sandbox' } }],
      volumeMounts: [{ name: 'f8', mountPath: '/f8' }],
      readinessProbe: { tcpSocket: { port: PORT } },
    }],
    volumes: [{ name: 'f8', persistentVolumeClaim: { claimName: `f8-${runId}-${stage}` } }],
  },
});

// Creates the step's PVC and pod, and returns the pod's IP once it's Ready.
// A pod deleted for a question may still be terminating when the answer comes (M6 D10): wait until it's gone, then create it.
export async function createSandbox(runId: string, stage: string, repo: string): Promise<string> {
  const image = JSON.parse(process.env.F8_IMAGES ?? '{}')[repo];
  if (!image) throw ApplicationFailure.nonRetryable(`no image for ${repo}`);
  const name = `f8-${runId}-${stage}`;
  await core.createNamespacedPersistentVolumeClaim({ namespace: NS, body: {
    metadata: { name, labels: labels(runId, stage) },
    spec: { storageClassName: 'nfs-client', accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '10Gi' } } },
  } }).catch(ignore(409));
  for (;;) {
    const pod = await core.readNamespacedPod({ name, namespace: NS }).catch(ignore(404));
    if (!pod) await core.createNamespacedPod({ namespace: NS, body: sandboxPod(runId, stage, image) }).catch(ignore(409));
    else if (!pod.metadata?.deletionTimestamp && pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')) return pod.status.podIP!;
    await Context.current().sleep(1000);
  }
}

// The workflow names the role, the activity knows the settings; the reviewer model differs (M5 D7, DEP-11).
// A ship step brings its own profile (M6 D1), which wins.
export type Role = 'author' | 'reviewer';
export type Profile = { model: string; effort?: string };
export async function startStep(ip: string, r: Omit<StepRequest, 'profile'> & { profile?: Profile }, role?: Role) {
  const model = (role === 'reviewer' ? process.env.F8_REVIEW_MODEL : process.env.F8_MODEL)!;
  const step: StepRequest = { ...r, profile: { vendor: 'claude-code', ...(r.profile ?? { model }) } };
  const res = await fetch(`http://${ip}:${PORT}/steps`, { method: 'POST', body: JSON.stringify(step) });
  if (res.status !== 202) throw ApplicationFailure.nonRetryable(`adapter answered ${res.status}: ${await res.text()}`);
}

export async function answerStep(ip: string, stepId: string, answer: string) {
  const res = await fetch(`http://${ip}:${PORT}/steps/${stepId}/answer`, { method: 'POST', body: JSON.stringify({ answer }) });
  if (res.status !== 202) throw ApplicationFailure.nonRetryable(`adapter answered ${res.status}: ${await res.text()}`);
}

export interface Bands { design: Profile; acceptance: Profile; implement: Profile[]; review: Profile; diagnose: Profile; finish: Profile }

// The ship run's settings, read once per run so its history holds them (M6 D9). DEP-11: reviewers aren't authors' models.
export async function shipConfig(): Promise<{ bands: Bands; plugin: string }> {
  const bad = (why: string) => ApplicationFailure.nonRetryable(`bad F8_BANDS: ${why}`, 'bad_bands');
  let b: Bands;
  try { b = JSON.parse(process.env.F8_BANDS ?? ''); } catch { throw bad('not JSON'); }
  const one = (p?: Profile) => typeof p?.model === 'string' && p.model !== '';
  for (const k of ['design', 'acceptance', 'review', 'diagnose', 'finish'] as const)
    if (!one(b?.[k])) throw bad(`${k} needs a model`);
  if (!Array.isArray(b.implement) || !b.implement.length || !b.implement.every(one)) throw bad('implement needs a non-empty list of models');
  const authors = [b.design, b.acceptance, ...b.implement].map(p => p.model);
  for (const k of ['review', 'diagnose'] as const)
    if (authors.includes(b[k].model)) throw bad(`${k} model ${b[k].model} is an author model`);
  if (!process.env.F8_PLUGIN) throw bad('F8_PLUGIN is not set');
  return { bands: b, plugin: process.env.F8_PLUGIN };
}

// Long-polls the step's events after `after` until an exit event. A resumed step's log still holds its earlier exits.
export async function pollStep(ip: string, stepId: string, after = 0): Promise<Exit> {
  const { cancellationSignal } = Context.current();
  for (;;) {
    const res = await fetch(`http://${ip}:${PORT}/steps/${stepId}/events?after=${after}`, { signal: cancellationSignal });
    if (!res.ok) throw new Error(`adapter answered ${res.status}: ${await res.text()}`);
    const { events } = await res.json() as { events: StepEvent[] };
    for (const e of events) {
      if (e.type === 'exit') return e;
      after = e.seq;
    }
  }
}

// Deletes only the pod: the PVC keeps the session logs (AGT-11).
export async function deleteSandbox(runId: string, stage: string) {
  await core.deleteNamespacedPod({ name: `f8-${runId}-${stage}`, namespace: NS }).catch(ignore(404));
}
