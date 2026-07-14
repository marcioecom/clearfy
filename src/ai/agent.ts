import { env } from "@/config";
import { createDrizzleCatalog } from "@/business/drizzle-catalog";
import { ChatOpenAI } from "@langchain/openai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { createOilChangeAgent } from "./create-agent";
import { createBusinessTools } from "./tools/business";

export { conversationConfig } from "./conversation";

let agent: ReturnType<typeof createOilChangeAgent> | null = null;

export async function getAgent() {
  if (agent) return agent;

  const model = new ChatOpenAI({
    apiKey: env.AI_GATEWAY_API_KEY,
    modelName: "openai/gpt-4o-mini",
    configuration: {
      baseURL: "https://ai-gateway.vercel.sh/v1",
    },
  });
  const store = PostgresStore.fromConnString(env.DATABASE_URL, {
    ensureTables: false,
  });
  const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL);
  const catalog = createDrizzleCatalog();
  const tools = createBusinessTools(catalog);

  agent = createOilChangeAgent({
    model,
    store,
    checkpointer,
    tools,
  });
  return agent;
}
