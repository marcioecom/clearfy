import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { createTrajectoryMatchEvaluator } from "agentevals";
import { fakeModel, tool } from "langchain";
import { expect, it } from "vitest";
import { z } from "zod";
import { createOilChangeAgent } from "./create-agent";

it("follows the required price lookup trajectory", async () => {
  const toolCall = {
    name: "consultar_preco_produto",
    args: { query: "5W30" },
    id: "price-trajectory-1",
  };
  const priceTool = tool(
    async () => "R$ 75,00 por litro; preço não confirma estoque",
    {
      name: toolCall.name,
      description: "Consulta preço cadastrado.",
      schema: z.object({ query: z.string() }),
    },
  );
  const finalText =
    "O preço cadastrado é R$ 75,00 por litro. Vou confirmar o estoque.";
  const model = fakeModel()
    .respondWithTools([toolCall])
    .respond(new AIMessage(finalText));
  const agent = createOilChangeAgent({ model, tools: [priceTool] });
  const input = new HumanMessage("Qual o valor do 5W30?");

  const result = await agent.invoke({ messages: [input] });

  const reference = [
    input,
    new AIMessage({ content: "", tool_calls: [toolCall] }),
    new ToolMessage({
      content: "R$ 75,00 por litro; preço não confirma estoque",
      tool_call_id: toolCall.id,
      name: toolCall.name,
    }),
    new AIMessage(finalText),
  ];
  const evaluator = createTrajectoryMatchEvaluator({
    trajectoryMatchMode: "strict",
  });
  const evaluation = await evaluator({
    outputs: result.messages,
    referenceOutputs: reference,
  });

  expect(evaluation.score).toBe(true);
  expect(finalText.trim()).not.toBe("");
  expect(finalText).not.toContain("undefined");
  expect(finalText).not.toContain("[object Object]");
  expect(
    result.messages.flatMap((message) =>
      AIMessage.isInstance(message)
        ? (message.tool_calls ?? []).map((call) => call.name)
        : [],
    ),
  ).not.toContain("web_search");
});
