import { env } from "@/config";
import { ChatOpenAI } from "@langchain/openai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { createAgent, ReactAgent } from "langchain";

const model = new ChatOpenAI({
  apiKey: env.AI_GATEWAY_API_KEY,
  modelName: "openai/gpt-4o-mini",
  configuration: {
    baseURL: "https://ai-gateway.vercel.sh/v1",
  },
});

const SYSTEM_PROMPT = `Você é um assistente util que atende pelo Whatsapp`;

let agent: ReactAgent | null = null;

export async function getAgent() {
  if (agent) return agent;

  const store = PostgresStore.fromConnString(env.DATABASE_URL);
  await store.setup();

  const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL);
  await checkpointer.setup();

  agent = createAgent({
    model,
    store,
    checkpointer,
    tools: [],
    systemPrompt: SYSTEM_PROMPT,
  });
  return agent;
}
