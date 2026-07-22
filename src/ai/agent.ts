import { env } from "@/config";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, ReactAgent } from "langchain";
import { searchWeb } from "./tools/search";

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

  const checkpointer = new MemorySaver();

  agent = createAgent({
    model,
    checkpointer,
    tools: [searchWeb],
    systemPrompt: SYSTEM_PROMPT,
  });
  return agent;
}
