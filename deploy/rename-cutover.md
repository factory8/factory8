# Cutover: f8-* names to factory8-*

A one-time step for a cluster installed before the rename (PR #12). `kubectl apply` creates the new objects next to the old ones. It doesn't delete the old ones, and it doesn't move runs that are already in flight. Run these steps in order.

1. **Drain runs.** A run that is in flight replays with the new branch, namespace and sandbox names, and it loses its session. Let every run end, or terminate it:
   `temporal workflow list --query 'ExecutionStatus="Running"'`, then `temporal workflow terminate --workflow-id <id>` for each one.
2. **Copy the sandbox secret** in OpenBao from `apps/f8-sandbox` to `apps/factory8-sandbox` (`deploy/eso.yaml`). Without it, every sandbox pod waits on a missing Secret.
3. **Delete the old objects:**
   `kubectl -n factory8 delete deployment/f8-worker serviceaccount/f8-worker`
   `kubectl delete namespace f8-sandboxes` (this removes the old Role, RoleBinding, ExternalSecret, Secret, pods and PVCs, including old session logs; copy out any you want first).
4. **Apply:** `kubectl apply -k deploy/`, then check that `kubectl -n factory8-sandboxes get secret factory8-sandbox` exists.
5. Once the old runs' PRs are merged or closed, delete their `f8/<id>` branches.
