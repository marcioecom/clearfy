import { tavily } from "@tavily/core";
import { tool } from "langchain";
import { env } from "@/config";
import z from "zod";

const tvly = tavily({ apiKey: env.TAVILY_API_KEY });

export const searchWeb = tool(
  async (input) => {
    return await tvly.search(input.query, {
      maxResults: input.maxResults,
      searchDepth: input.searchDepth,
    });
  },
  {
    name: "web_search",
    description:
      "Search the web for real-time information. Use this tool to answer questions about current events, recent news, fast-changing facts, or when you lack specific up-to-date technical data.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "The search query optimized for search engines. Use concise keywords instead of full conversational sentences. Example: 'US election results 2026' instead of 'who won the election in the United States?'",
        ),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe(
          "The maximum number of search results to return. Use lower numbers (1-3) for quick fact-checks, and higher numbers (5-8) for deep-dive research.",
        ),
      searchDepth: z
        .enum(["basic", "advanced"])
        .optional()
        .default("advanced")
        .describe(
          "The depth of the search. Use 'basic' for faster responses or 'advanced' for comprehensive, high-quality analysis.",
        ),
    }),
  },
);
