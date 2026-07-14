import type { CommercialCatalogReader } from "@/business/catalog";
import { describe, expect, it } from "vitest";
import { createBusinessTools } from "./business";

describe("createBusinessTools", () => {
  it("returns the registered price with an inventory warning", async () => {
    const catalog: CommercialCatalogReader = {
      async getProfile() {
        return null;
      },
      async findCurrentOffers() {
        return [
          {
            sku: "OIL-5W30-1L",
            brand: "Marca Exemplo",
            name: "Óleo 5W30",
            viscosity: "5W30",
            specifications: ["API SP"],
            unit: "litro",
            priceCents: 7500,
            validFrom: new Date("2026-07-14T00:00:00.000Z"),
          },
        ];
      },
    };
    const [, priceTool] = createBusinessTools(catalog);

    const result = await priceTool.invoke({ query: "5W30" });

    expect(result).toContain("R$ 75,00");
    expect(result).toContain("não confirma estoque");
  });

  it("explains when no current price matches the query", async () => {
    const catalog: CommercialCatalogReader = {
      async getProfile() {
        return null;
      },
      async findCurrentOffers() {
        return [];
      },
    };
    const [, missingPriceTool] = createBusinessTools(catalog);

    const result = await missingPriceTool.invoke({ query: "0W20" });

    expect(result).toContain("Nenhum preço atual");
  });

  it("explains when establishment information is not registered", async () => {
    const catalog: CommercialCatalogReader = {
      async getProfile() {
        return null;
      },
      async findCurrentOffers() {
        return [];
      },
    };
    const [missingProfileTool] = createBusinessTools(catalog);

    const result = await missingProfileTool.invoke({});

    expect(result).toContain("ainda não foram cadastradas");
  });
});
