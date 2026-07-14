## Local development

1. Start PostgreSQL with `docker compose up -d postgres`.
2. Configure `.env` from `.env.example`.
3. Apply reviewed migrations with `pnpm db:migrate`.
4. Import confirmed data with `pnpm business:import -- data/business.json`.
5. Start the API with `pnpm dev`.

Run deterministic tests with `pnpm test`, PostgreSQL tests with
`pnpm test:integration`, deterministic agent evals with
`pnpm eval:deterministic`, and real-model experiments in the existing
LangSmith project with `pnpm eval:langsmith`.

The LangSmith command synchronizes `evals/commercial-assistant.json` into the
named `oil-change-commercial-assistant` dataset before starting an experiment.
It requires the LangGraph Postgres store and checkpoint tables to have been
provisioned as a deployment step. The command reports `BLOCKED` when they are
missing and never creates database tables.

Code evaluators are blocking. The groundedness and conciseness LLM judges are
observational until repeated experiments have been compared with human review.
No judge threshold or repetition count has been established.

## Current safety boundary

The assistant can answer establishment and current product-price questions.
It does not yet have a published vehicle application catalog, filter catalog,
stock control, or complete quote calculation. Those questions require human
confirmation.

Database migrations are a deployment step. The web process never applies DDL.
CloudNativePG and the Kubernetes migration Job are planned separately.
