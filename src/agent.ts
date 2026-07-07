import { env } from "@/config";
import { MemorySaver } from "@langchain/langgraph";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, ReactAgent, tool } from "langchain";
import { z } from "zod";

const model = new ChatOpenAI({
  apiKey: env.AI_GATEWAY_API_KEY,
  modelName: "openai/gpt-4o-mini",
  configuration: {
    baseURL: "https://ai-gateway.vercel.sh/v1",
  },
});

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    time: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@theo.foobar/mcp-time"],
    },
  },
  useStandardContentBlocks: true,
});

const getWeather = tool((input) => `It's always sunny in ${input.city}!`, {
  name: "get_weather",
  description: "Get the weather for a given city",
  schema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),
});

const checkpointer = new MemorySaver();

const SYSTEM_PROMPT = `Você é um assistente util que atende pelo Whatsapp`;

let agent: ReactAgent | null = null;

export async function getAgent() {
  if (agent) return agent;

  const mcpTools = await mcpClient.getTools();

  agent = createAgent({
    model,
    checkpointer,
    tools: [getWeather, ...mcpTools],
    systemPrompt: SYSTEM_PROMPT,
  });
  return agent;
}
