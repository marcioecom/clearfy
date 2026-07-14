import { createAgent } from "langchain";
import { SYSTEM_PROMPT } from "./system-prompt";

type CreateAgentOptions = Parameters<typeof createAgent>[0];
type AgentTool = NonNullable<CreateAgentOptions["tools"]>[number];

interface AgentDependencies {
  model: CreateAgentOptions["model"];
  tools: readonly AgentTool[];
  checkpointer?: CreateAgentOptions["checkpointer"];
  store?: CreateAgentOptions["store"];
}

export function createOilChangeAgent(dependencies: AgentDependencies) {
  return createAgent({
    model: dependencies.model,
    tools: [...dependencies.tools],
    systemPrompt: SYSTEM_PROMPT,
    ...(dependencies.checkpointer
      ? { checkpointer: dependencies.checkpointer }
      : {}),
    ...(dependencies.store ? { store: dependencies.store } : {}),
  });
}
