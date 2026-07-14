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

it("rejects a repeated SKU with the same price at the duplicate path", () => {
  const result = businessImportSchema.safeParse({
    ...validInput,
    products: [validInput.products[0], { ...validInput.products[0] }],
  });

  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected duplicate SKU validation to fail");
  expect(result.error.issues).toContainEqual(
    expect.objectContaining({
      message: 'Duplicate SKU "OLEO-EXEMPLO-5W30-1L"',
      path: ["products", 1, "sku"],
    }),
  );
});

it("rejects a repeated SKU with a different price at the duplicate path", () => {
  const result = businessImportSchema.safeParse({
    ...validInput,
    products: [
      validInput.products[0],
      { ...validInput.products[0], priceCents: 4990 },
    ],
  });

  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected duplicate SKU validation to fail");
  expect(result.error.issues).toContainEqual(
    expect.objectContaining({
      message: 'Duplicate SKU "OLEO-EXEMPLO-5W30-1L"',
      path: ["products", 1, "sku"],
    }),
  );
});
