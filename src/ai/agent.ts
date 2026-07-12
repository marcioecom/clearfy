import { env } from "@/config";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, ReactAgent } from "langchain";
import { mcpClient } from "./tools/mcp";
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

  const mcpTools = await mcpClient.getTools();
  const checkpointer = new MemorySaver();

  agent = createAgent({
    model,
    checkpointer,
    tools: [searchWeb, ...mcpTools],
    systemPrompt: SYSTEM_PROMPT,
  });
  return agent;
}
