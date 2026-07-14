import { expect, it } from "vitest";
import { businessImportSchema } from "./import-schema";

const validInput = {
  profile: {
    businessName: "Oficina Exemplo",
    address: "Rua Exemplo, 100",
    openingHours: "Segunda a sexta, 08:00-18:00",
    paymentMethods: ["Cartao"],
    services: ["Troca de oleo"],
  },
  products: [
    {
      sku: "OLEO-EXEMPLO-5W30-1L",
      brand: "Marca Exemplo",
      name: "Oleo Sintetico Exemplo",
      viscosity: "5W30",
      specifications: ["API SP"],
      unit: "frasco de 1 litro",
      priceCents: 4590,
    },
  ],
  source: "catalogo-ficticio",
  createdBy: "usuario-exemplo",
};

it("accepts a complete business import with explicit commercial units", () => {
  expect(() => businessImportSchema.parse(validInput)).not.toThrow();
});

it("rejects a product with a non-positive price", () => {
  expect(() =>
    businessImportSchema.parse({
      ...validInput,
      products: [{ ...validInput.products[0], priceCents: 0 }],
    }),
  ).toThrow();
});

it("rejects unreviewed fields outside the import contract", () => {
  expect(() =>
    businessImportSchema.parse({ ...validInput, unreviewed: true }),
  ).toThrow();
});
