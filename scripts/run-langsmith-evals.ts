import { getAgent } from "@/ai/agent";
import { extractTextResponse } from "@/ai/response";
import { env } from "@/config";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { Client as LangSmithClient } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { readFile } from "node:fs/promises";
import { CONCISENESS_PROMPT, createLLMAsJudge } from "openevals";
import { Client as PostgresClient } from "pg";
import { z } from "zod";

const DATASET_NAME = "oil-change-commercial-assistant";
const BASELINE_VERSION = "commercial-v1";
const REQUIRED_LANGGRAPH_TABLES = [
  "checkpoint_migrations",
  "checkpoints",
  "checkpoint_blobs",
  "checkpoint_writes",
  "store_migrations",
  "store",
] as const;
const BLOCKING_EVALUATORS = new Set([
  "non_empty_response",
  "no_serialization_artifact",
  "no_open_web_tool",
  "required_tool_called",
  "forbidden_claim_absent",
]);

const scenarioSchema = z.object({
  id: z.string(),
  category: z.string(),
  messages: z.array(z.string()).min(1),
  requiredTools: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
});
const scenariosSchema = z.array(scenarioSchema);
const targetOutputSchema = z.object({
  answer: z.string(),
  messages: z.array(z.unknown()),
  calledTools: z.array(z.string()),
});
const referenceOutputSchema = z.object({
  requiredTools: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
});

type Scenario = z.infer<typeof scenarioSchema>;
type EvaluatorInput = {
  inputs?: unknown;
  outputs: unknown;
  referenceOutputs?: unknown;
};

const scenariosPromise = readFile("evals/commercial-assistant.json", "utf8").then(
  (contents) => scenariosSchema.parse(JSON.parse(contents)),
);

async function assertLangGraphSchema(): Promise<void> {
  const database = new PostgresClient({ connectionString: env.DATABASE_URL });
  await database.connect();
  try {
    const result = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = current_schema()
         and table_name = any($1::text[])`,
      [[...REQUIRED_LANGGRAPH_TABLES]],
    );
    const existing = new Set(result.rows.map((row) => row.table_name));
    const missing = REQUIRED_LANGGRAPH_TABLES.filter(
      (table) => !existing.has(table),
    );
    if (missing.length > 0) {
      throw new Error(
        `BLOCKED: missing pre-provisioned LangGraph tables: ${missing.join(", ")}`,
      );
    }
  } finally {
    await database.end();
  }
}

function scenarioInputs(scenario: Scenario) {
  return { id: scenario.id, messages: scenario.messages };
}

function scenarioOutputs(scenario: Scenario) {
  return {
    requiredTools: scenario.requiredTools,
    forbiddenClaims: scenario.forbiddenClaims,
  };
}

async function syncDataset(
  client: LangSmithClient,
  scenarios: Scenario[],
): Promise<void> {
  const dataset = (await client.hasDataset({ datasetName: DATASET_NAME }))
    ? await client.readDataset({ datasetName: DATASET_NAME })
    : await client.createDataset(DATASET_NAME, {
        description:
          "Versioned commercial assistant golden scenarios from evals/commercial-assistant.json.",
      });
  const existingByScenario = new Map<
    string,
    { id: string; metadata?: Record<string, unknown> }
  >();

  for await (const example of client.listExamples({ datasetId: dataset.id })) {
    const scenarioId = example.metadata?.scenarioId;
    if (typeof scenarioId === "string") {
      existingByScenario.set(scenarioId, {
        id: example.id,
        metadata: example.metadata,
      });
    }
  }

  const updates = scenarios.flatMap((scenario) => {
    const existing = existingByScenario.get(scenario.id);
    return existing
      ? [
          {
            id: existing.id,
            inputs: scenarioInputs(scenario),
            outputs: scenarioOutputs(scenario),
            metadata: {
              ...existing.metadata,
              scenarioId: scenario.id,
              category: scenario.category,
              baselineVersion: BASELINE_VERSION,
            },
          },
        ]
      : [];
  });
  const creates = scenarios.flatMap((scenario) =>
    existingByScenario.has(scenario.id)
      ? []
      : [
          {
            dataset_id: dataset.id,
            inputs: scenarioInputs(scenario),
            outputs: scenarioOutputs(scenario),
            metadata: {
              scenarioId: scenario.id,
              category: scenario.category,
              baselineVersion: BASELINE_VERSION,
            },
          },
        ],
  );
  const currentIds = new Set(scenarios.map((scenario) => scenario.id));
  const staleIds = [...existingByScenario]
    .filter(([scenarioId]) => !currentIds.has(scenarioId))
    .map(([, example]) => example.id);

  if (updates.length > 0) await client.updateExamples(updates);
  if (creates.length > 0) await client.createExamples(creates);
  if (staleIds.length > 0) await client.deleteExamples(staleIds);
}

function calledTools(messages: readonly unknown[]): string[] {
  return messages.flatMap((message) =>
    AIMessage.isInstance(message)
      ? (message.tool_calls ?? []).map((call) => call.name)
      : [],
  );
}

function parseOutputs(outputs: unknown) {
  return targetOutputSchema.safeParse(outputs);
}

function parseEvaluation(input: EvaluatorInput) {
  return {
    outputs: parseOutputs(input.outputs),
    referenceOutputs: referenceOutputSchema.safeParse(input.referenceOutputs),
  };
}

function containsForbiddenClaim(answer: string, claim: string): boolean {
  let fromIndex = 0;
  let matchIndex = answer.indexOf(claim, fromIndex);

  while (matchIndex !== -1) {
    const precedingWords = answer
      .slice(0, matchIndex)
      .trimEnd()
      .split(/\s+/)
      .slice(-1);
    if (!precedingWords.some((word) => word === "não" || word === "nunca")) {
      return true;
    }
    fromIndex = matchIndex + claim.length;
    matchIndex = answer.indexOf(claim, fromIndex);
  }

  return false;
}

async function main(): Promise<void> {
  const scenarios = await scenariosPromise;
  const judgeModel = new ChatOpenAI({
    apiKey: env.AI_GATEWAY_API_KEY,
    modelName: "openai/gpt-4o-mini",
    temperature: 0,
    configuration: { baseURL: "https://ai-gateway.vercel.sh/v1" },
  });
  type Judge = NonNullable<
    Parameters<typeof createLLMAsJudge>[0]["judge"]
  >;
  // OpenEvals bundles a separate copy of LangChain core, making identical model
  // classes nominally incompatible even though OpenEvals accepts this at runtime.
  const judge = judgeModel as unknown as Judge;
  const groundednessJudge = createLLMAsJudge({
    judge,
    feedbackKey: "commercial_groundedness",
    prompt: `Avalie se a resposta usa apenas fatos comerciais sustentados pelas
ferramentas, não inventa preço, estoque ou compatibilidade e pede confirmação
humana quando necessário. Entradas: {inputs}. Saída: {outputs}.
Responda usando o formato de avaliação solicitado.`,
  });
  const concisenessJudge = createLLMAsJudge({
    judge,
    feedbackKey: "whatsapp_conciseness",
    prompt: CONCISENESS_PROMPT,
  });
  const observeGroundedness = (input: EvaluatorInput) =>
    groundednessJudge({
      inputs: input.inputs,
      outputs: input.outputs,
      referenceOutputs: input.referenceOutputs,
    });
  const observeConciseness = (input: EvaluatorInput) =>
    concisenessJudge({
      inputs: input.inputs,
      outputs: input.outputs,
      referenceOutputs: input.referenceOutputs,
    });

  await assertLangGraphSchema();

  const langsmith = new LangSmithClient();
  await syncDataset(langsmith, scenarios);
  const agent = await getAgent();
  const results = await evaluate(
    async (inputs: { id: string; messages: string[] }) => {
      const scenarioThreadId = `eval-${inputs.id}-${crypto.randomUUID()}`;
      let messages: unknown[] = [];
      let answer = "";

      for (const content of inputs.messages) {
        const result = await agent.invoke(
          { messages: [new HumanMessage(content)] },
          {
            configurable: { thread_id: scenarioThreadId },
            metadata: { thread_id: scenarioThreadId },
          },
        );
        messages = result.messages;
        answer = extractTextResponse(result.messages.at(-1)?.content);
      }

      return { answer, messages, calledTools: calledTools(messages) };
    },
    {
      data: DATASET_NAME,
      evaluators: [
        ({ outputs }: EvaluatorInput) => {
          const parsed = parseOutputs(outputs);
          return {
            key: "non_empty_response",
            score: parsed.success && Boolean(parsed.data.answer.trim()),
          };
        },
        ({ outputs }: EvaluatorInput) => {
          const parsed = parseOutputs(outputs);
          return {
            key: "no_serialization_artifact",
            score:
              parsed.success &&
              !/undefined|\[object Object\]/.test(parsed.data.answer),
          };
        },
        ({ outputs }: EvaluatorInput) => {
          const parsed = parseOutputs(outputs);
          return {
            key: "no_open_web_tool",
            score:
              parsed.success && !parsed.data.calledTools.includes("web_search"),
          };
        },
        (input: EvaluatorInput) => {
          const parsed = parseEvaluation(input);
          const tools = parsed.outputs.success
            ? parsed.outputs.data.calledTools
            : [];
          return {
            key: "required_tool_called",
            score:
              parsed.outputs.success &&
              parsed.referenceOutputs.success &&
              parsed.referenceOutputs.data.requiredTools.every((name) =>
                tools.includes(name),
              ),
          };
        },
        (input: EvaluatorInput) => {
          const parsed = parseEvaluation(input);
          const answer = parsed.outputs.success
            ? parsed.outputs.data.answer.toLocaleLowerCase("pt-BR")
            : "";
          return {
            key: "forbidden_claim_absent",
            score:
              parsed.outputs.success &&
              parsed.referenceOutputs.success &&
              parsed.referenceOutputs.data.forbiddenClaims.every(
                (claim) =>
                  !containsForbiddenClaim(
                    answer,
                    claim.toLocaleLowerCase("pt-BR"),
                  ),
              ),
          };
        },
        observeGroundedness,
        observeConciseness,
      ],
      experimentPrefix: "oil-change-commercial-assistant",
      metadata: {
        model: "openai/gpt-4o-mini",
        promptVersion: BASELINE_VERSION,
        tools: ["consultar_estabelecimento", "consultar_preco_produto"],
        commit: process.env.GITHUB_SHA ?? "local",
        tracingProject: process.env.LANGSMITH_PROJECT,
      },
    },
  );

  const failedCodeEvaluations = results.results.flatMap((row) =>
    row.evaluationResults.results.filter(
      (evaluation) =>
        BLOCKING_EVALUATORS.has(evaluation.key) && evaluation.score !== true,
    ),
  );
  console.log(`Completed LangSmith experiment: ${results.experimentName}`);
  for (const row of results.results) {
    console.log(
      JSON.stringify({
        scenario: row.example.inputs.id,
        feedback: row.evaluationResults.results.map((evaluation) => ({
          key: evaluation.key,
          score: evaluation.score,
          comment: evaluation.comment,
        })),
      }),
    );
  }

  if (failedCodeEvaluations.length > 0) {
    for (const row of results.results) {
      const failures = row.evaluationResults.results.filter(
        (evaluation) =>
          BLOCKING_EVALUATORS.has(evaluation.key) && evaluation.score !== true,
      );
      if (failures.length > 0) {
        console.error(
          JSON.stringify({
            scenario: row.example.inputs.id,
            failures: failures.map((failure) => failure.key),
            output: row.run.outputs,
          }),
        );
      }
    }
    throw new Error(
      `Blocking code evaluators failed: ${failedCodeEvaluations
        .map((evaluation) => evaluation.key)
        .join(", ")}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
