import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { fakeModel, tool } from "langchain";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createOilChangeAgent } from "./create-agent";

it("executes the selected price tool and returns the final answer", async () => {
  const lookup = vi.fn().mockResolvedValue("Preço: R$ 75,00 por litro");
  const priceTool = tool(lookup, {
    name: "consultar_preco_produto",
    description: "Consulta preço cadastrado.",
    schema: z.object({ query: z.string() }),
  });
  const model = fakeModel()
    .respondWithTools([
      {
        name: "consultar_preco_produto",
        args: { query: "5W30" },
        id: "price-1",
      },
    ])
    .respond(new AIMessage("O 5W30 cadastrado custa R$ 75,00 por litro."));
  const agent = createOilChangeAgent({ model, tools: [priceTool] });

  const result = await agent.invoke({
    messages: [new HumanMessage("Quanto custa o 5W30?")],
  });

  expect(lookup).toHaveBeenCalledWith(
    { query: "5W30" },
    expect.anything(),
  );
  expect(result.messages.at(-1)?.text).toContain("R$ 75,00");
  expect(model.callCount).toBe(2);
});

it("returns a final answer after a supplied tool fails", async () => {
  const failingLookup = vi.fn().mockRejectedValue(new Error("catalog offline"));
  const omittedLookup = vi.fn().mockResolvedValue("must not run");
  const failingTool = tool(failingLookup, {
    name: "consultar_preco_produto",
    description: "Consulta preço cadastrado.",
    schema: z.object({ query: z.string() }),
  });
  tool(omittedLookup, {
    name: "ferramenta_nao_fornecida",
    description: "Não fornecida ao agente.",
    schema: z.object({}),
  });
  const model = fakeModel()
    .respondWithTools([
      {
        name: "consultar_preco_produto",
        args: { query: "5W30" },
        id: "price-failure-1",
      },
    ])
    .respond(
      new AIMessage("Não consegui consultar o preço; o responsável precisa confirmar."),
    );
  const agent = createOilChangeAgent({ model, tools: [failingTool] });

  const result = await agent.invoke({
    messages: [new HumanMessage("Quanto custa o 5W30?")],
  });

  expect(failingLookup).toHaveBeenCalledOnce();
  expect(omittedLookup).not.toHaveBeenCalled();
  expect(result.messages.at(-1)?.text).toContain("precisa confirmar");
  expect(model.callCount).toBe(2);
});

it("returns a direct answer without executing a tool", async () => {
  const lookup = vi.fn().mockResolvedValue("must not run");
  const priceTool = tool(lookup, {
    name: "consultar_preco_produto",
    description: "Consulta preço cadastrado.",
    schema: z.object({ query: z.string() }),
  });
  const model = fakeModel().respond(
    new AIMessage("O responsável precisa confirmar essa informação."),
  );
  const agent = createOilChangeAgent({ model, tools: [priceTool] });

  const result = await agent.invoke({
    messages: [new HumanMessage("Vocês têm o produto em estoque?")],
  });

  expect(lookup).not.toHaveBeenCalled();
  expect(result.messages.at(-1)?.text).toContain("precisa confirmar");
  expect(model.callCount).toBe(1);
});
