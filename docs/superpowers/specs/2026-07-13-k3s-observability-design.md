# Self-hosted k3s observability design

## Context

The cluster hosts personal projects and currently has three nodes:

- One Hetzner control-plane node with 2 vCPU, 4 GB of memory, and 40 GB of disk.
- Two Oracle worker nodes, each with 1 OCPU, 1 GB of memory, and 47 GB of disk.
- Observed cluster utilization at design time was 4% CPU and 47% memory in k9s.

Applications are deployed with Kubernetes manifests, use Traefik as the ingress controller, and follow standard `app.kubernetes.io/*` labels. The repository deploys through GitHub Actions over Tailscale.

The owner wants to operate the observability stack to learn how it works. The first version must provide a central place to inspect pod logs, cluster health, workload state, and HTTP request metrics without adding unnecessary operational weight.

## Goals

- Search container logs across namespaces, applications, pods, and containers.
- View node, pod, deployment, and Kubernetes resource metrics.
- View HTTP request rate, status codes, and latency as observed by Traefik.
- Correlate traffic or error changes with workload logs.
- Retain metrics and logs for 14 days initially.
- Keep the stack self-hosted and small enough for the current cluster.
- Store all Helm configuration in Git for reproducible installation and upgrades.
- Establish measured resource and storage baselines before increasing scope or retention.

## Non-goals

- High availability for observability components.
- Durable history across loss of the Hetzner node or its local volume.
- Distributed storage such as Longhorn.
- Application-level metrics, internal service-to-service traffic, or business metrics in the first version.
- Distributed tracing or a Tempo deployment in the first version.
- A GitOps controller such as Argo CD.
- A full `kube-prometheus-stack` deployment or Prometheus Operator CRDs.

## Architecture

The first version will use these components:

- Grafana for dashboards, exploration, and later alert management.
- A standalone Prometheus server for time-series metrics.
- Loki in single-binary mode for log storage and LogQL queries.
- Grafana Alloy as a DaemonSet for container log collection on every node.
- kube-state-metrics for Kubernetes object state.
- node-exporter as a DaemonSet for node operating-system metrics.
- Kubelet and cAdvisor scrape targets for pod and container resource metrics.
- Traefik's Prometheus endpoint for ingress request metrics.

Prometheus, Loki, Grafana, and kube-state-metrics will run in a dedicated `monitoring` namespace. Stateful components should be scheduled on the Hetzner node because it has more memory than either worker. Alloy and node-exporter must run on all nodes.

Prometheus and Loki are internal cluster services. Administrative access should use the existing Tailscale network. Grafana may be exposed through Traefik with TLS only if authentication and access restrictions are defined during implementation; otherwise it should remain accessible through Tailscale or port forwarding.

## Data flows

### Metrics

Prometheus pulls metrics from node-exporter, kube-state-metrics, kubelets, cAdvisor, and Traefik. Grafana queries Prometheus as its metrics data source.

Traefik is the first source of HTTP metrics. It provides the cluster-edge view of request volume, response status, and latency. Calls that bypass Traefik and application-specific behavior are intentionally outside the first version.

### Logs

Alloy runs on each node, discovers Kubernetes pods, reads container `stdout` and `stderr`, enriches entries with Kubernetes metadata, and sends them to Loki. Grafana queries Loki as its logs data source.

The initial indexed label set must remain bounded. It should include stable fields such as cluster, namespace, application label, pod, container, and log stream. Request IDs, user IDs, full URLs, error messages, and other unbounded values must remain log fields rather than Loki labels.

Health-check and other high-volume logs may be dropped only after their measured volume and diagnostic value have been reviewed.

## Deployment and configuration

Each component will be installed from an official or project-maintained Helm chart. Chart versions must be pinned. Repository-owned Helm values will be kept separately from application manifests so the observability lifecycle does not depend on an application deployment.

The implementation plan must select exact charts and versions after checking compatibility with the cluster's installed Kubernetes and k3s versions. It must not use floating chart versions.

The initial storage implementation will use the cluster's existing local StorageClass, subject to verification before installation. Prometheus and Loki require persistent volume claims. Grafana persistence is optional if dashboards and data sources are provisioned from Git; this choice must be resolved in the implementation plan.

Retention is 14 days for both Prometheus and Loki. Time-based retention must be paired with storage-size controls so unexpected log volume cannot consume the entire node disk. Exact PVC sizes, CPU requests, memory requests, and limits must be derived from available capacity and a small-scale measurement rather than guessed.

## Dashboards

The first version should provide views for:

- Node availability, CPU, memory, filesystem, and network usage.
- Pod resource usage and restart counts by namespace and application.
- Deployments with unavailable replicas and pods in unhealthy states.
- Traefik request rate grouped by service and response-code class.
- Traefik request latency.
- Log exploration filtered by namespace, application, pod, container, and severity when severity is present in structured logs.
- Navigation from a workload or HTTP error view to logs for the same application and time range.

Existing community dashboards may be imported as a starting point, but dashboards relied upon operationally should be provisioned from Git rather than edited only through the Grafana UI.

## Security

- Prometheus and Loki must not have public ingresses.
- Grafana must not be publicly exposed without TLS, authentication, and an explicit access-control decision.
- Kubernetes service accounts must receive only the read permissions required for discovery and collection.
- Secrets and credentials must not be stored in Helm values committed to Git.
- Logs must not contain authorization headers, tokens, credentials, or unnecessary personal data.
- Grafana, Loki, and Prometheus images and Helm chart versions must be pinned and upgraded deliberately.

## Failure behavior

The first version is deliberately single-instance. A restart of Prometheus, Loki, or Grafana can temporarily interrupt collection or queries. Loss of the Hetzner node or local persistent volume can cause loss of observability history. This is accepted for the initial learning-focused deployment and must be documented in operational notes.

Observability failures must not block application traffic. Collection agents should have explicit resource controls, and backend unavailability should result in bounded retries rather than unbounded local buffering or disk growth.

## Validation

Implementation is complete when all of the following are demonstrated:

- All three nodes appear in the node overview.
- CPU, memory, filesystem, and network metrics are queryable for every node.
- Pod and deployment state is visible for the existing `clearfy` workload.
- Logs from the `clearfy` application can be found using its existing `app.kubernetes.io/name: clearfy` label.
- A request to `clearfy.marcio.run` changes the corresponding Traefik request metrics.
- A controlled application log line appears in Grafana through Loki.
- Prometheus and Loki retain data across an ordinary pod restart.
- Prometheus and Loki cannot be reached from the public internet.
- Measured CPU, memory, disk use, ingestion rate, and query behavior are recorded after the initial small-scale deployment.
- The 14-day retention and storage-size controls are verified from running configuration.

## Delivery sequence

1. Inspect cluster version, node labels and taints, StorageClasses, current Traefik configuration, and available node capacity.
2. Add pinned Helm repositories, releases, and values to Git without installing the entire stack at once.
3. Install and validate the metrics path with Prometheus, node-exporter, kube-state-metrics, kubelet/cAdvisor, and Traefik.
4. Install and validate Loki and Alloy using a controlled log event.
5. Install Grafana, provision data sources, and validate the initial dashboards.
6. Measure resource consumption and ingestion volume at small scale.
7. Set final initial resource controls and storage allocations from those measurements.
8. Add a small set of actionable alerts only after dashboards and data collection are stable.

## Future extensions

- Instrument applications with Prometheus client libraries or OpenTelemetry.
- Add application-level latency, error, endpoint, and business metrics.
- Add Alertmanager notification routing.
- Add distributed tracing only when a concrete debugging need justifies Tempo and trace storage.
- Move metrics or logs to external object storage if preserving history becomes a requirement.
- Evaluate VictoriaMetrics only if measured Prometheus resource use or retention requirements justify a backend change.
