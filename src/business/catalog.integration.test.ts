import { db } from "@/db/client";
import { productPrices, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDrizzleCatalog } from "./drizzle-catalog";

const sku = `IT-CATALOG-${process.pid}`;
let productId: number;

beforeAll(async () => {
  await db.delete(products).where(eq(products.sku, sku));
  const [product] = await db
    .insert(products)
    .values({
      sku,
      brand: "Marca de integração",
      name: "Produto de integração",
      viscosity: "5W30",
      specifications: ["API SP"],
      unit: "litro",
    })
    .returning({ id: products.id });
  productId = product.id;
  await db.insert(productPrices).values({
    productId,
    priceCents: 7500,
    source: "integration-test",
    createdBy: "vitest",
  });
});

afterAll(async () => {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
});

it("finds a current offer by normalized viscosity", async () => {
  const offers = await createDrizzleCatalog().findCurrentOffers("5w30");
  expect(offers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sku, priceCents: 7500, unit: "litro" }),
    ]),
  );
});
