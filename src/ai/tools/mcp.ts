import { MultiServerMCPClient } from "@langchain/mcp-adapters";

export const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    time: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@theo.foobar/mcp-time"],
    },
  },
  useStandardContentBlocks: true,
});
