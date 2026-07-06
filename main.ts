import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import * as z from "zod";

const model = new ChatOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  modelName: "openai/gpt-4o-mini",
  configuration: {
    baseURL: "https://ai-gateway.vercel.sh/v1",
  },
});

const getWeather = tool((input) => `It's always sunny in ${input.city}!`, {
  name: "get_weather",
  description: "Get the weather for a given city",
  schema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),
});

const agent = createAgent({
  model,
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [
      { role: "user", content: "What's the weather in San Francisco?" },
    ],
  }),
);
