import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { createTrajectoryMatchEvaluator } from "agentevals";
import { fakeModel, tool } from "langchain";
import { expect, it, vi } from "vitest";
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

it("calls consultar_preco_produto even when the customer claims the product is not registered", async () => {
  const toolCall = {
    name: "consultar_preco_produto",
    args: { query: "óleo que não está cadastrado" },
    id: "unknown-price-1",
  };
  const toolSpy = vi.fn().mockImplementation(async () => "Produto não encontrado");
  const priceTool = tool(toolSpy, {
    name: toolCall.name,
    description: "Consulta preço cadastrado.",
    schema: z.object({ query: z.string() }),
  });
  const finalText =
    "Não encontrei o preço desse produto na base. O responsável precisa confirmar.";
  const model = fakeModel()
    .respondWithTools([toolCall])
    .respond(new AIMessage(finalText));
  const agent = createOilChangeAgent({ model, tools: [priceTool] });
  const input = new HumanMessage(
    "Quanto custa um óleo que não está cadastrado?",
  );

  const result = await agent.invoke({ messages: [input] });

  expect(toolSpy).toHaveBeenCalledWith(
    expect.objectContaining({ query: "óleo que não está cadastrado" }),
    expect.anything(),
  );
  expect(result.messages.at(-1)?.text).toContain("precisa confirmar");
  const calledNames = result.messages.flatMap((message) =>
    AIMessage.isInstance(message)
      ? (message.tool_calls ?? []).map((call) => call.name)
      : [],
  );
  expect(calledNames).toContain("consultar_preco_produto");
  expect(model.callCount).toBe(2);
});
