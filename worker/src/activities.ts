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
const labels = (runId: string) => ({ app: 'f8-sandbox', 'f8/run': runId });

// The project template: the admin-owned settings of every sandbox (DEP-6).
export const sandboxPod = (runId: string, image: string): k8s.V1Pod => ({
  metadata: { name: `f8-${runId}`, labels: labels(runId) },
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
    volumes: [{ name: 'f8', persistentVolumeClaim: { claimName: `f8-${runId}` } }],
  },
});

// Creates the run's PVC and pod, and returns the pod's IP once it's Ready.
export async function createSandbox(runId: string, repo: string): Promise<string> {
  const image = JSON.parse(process.env.F8_IMAGES ?? '{}')[repo];
  if (!image) throw ApplicationFailure.nonRetryable(`no image for ${repo}`);
  const name = `f8-${runId}`;
  await core.createNamespacedPersistentVolumeClaim({ namespace: NS, body: {
    metadata: { name, labels: labels(runId) },
    spec: { storageClassName: 'nfs-client', accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '10Gi' } } },
  } }).catch(ignore(409));
  await core.createNamespacedPod({ namespace: NS, body: sandboxPod(runId, image) }).catch(ignore(409));
  for (;;) {
    const pod = await core.readNamespacedPod({ name, namespace: NS });
    if (pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')) return pod.status.podIP!;
    await Context.current().sleep(1000);
  }
}

// Without a profile, the step gets the installation default (D8).
export async function startStep(ip: string, r: Omit<StepRequest, 'profile'> & Partial<Pick<StepRequest, 'profile'>>) {
  const step: StepRequest = { ...r, profile: r.profile ?? { vendor: 'claude-code', model: process.env.F8_MODEL! } };
  const res = await fetch(`http://${ip}:${PORT}/steps`, { method: 'POST', body: JSON.stringify(step) });
  if (res.status !== 202) throw ApplicationFailure.nonRetryable(`adapter answered ${res.status}: ${await res.text()}`);
}

// Long-polls the step's events until its exit event.
export async function pollStep(ip: string, stepId: string): Promise<Exit> {
  const { cancellationSignal } = Context.current();
  for (let after = 0; ;) {
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
export async function deleteSandbox(runId: string) {
  await core.deleteNamespacedPod({ name: `f8-${runId}`, namespace: NS }).catch(ignore(404));
}
