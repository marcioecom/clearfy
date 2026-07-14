import * as schema from "@/db/schema";
import { businessProfile, productPrices, products } from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { importBusinessData } from "./import";
import type { BusinessImport } from "./import-schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");

const pool = new Pool({ connectionString: testDatabaseUrl });
const database = drizzle({ client: pool, schema });
const sku = `IT-IMPORT-${randomUUID()}`;
const concurrencySku = `IT-IMPORT-CONCURRENT-${randomUUID()}`;
let previousProfile: typeof businessProfile.$inferSelect | undefined;

const fixture: BusinessImport = {
  profile: {
    businessName: "Oficina Integracao Exemplo",
    paymentMethods: ["Cartao"],
    services: ["Troca de oleo"],
  },
  products: [
    {
      sku,
      brand: "Marca Integracao Exemplo",
      name: "Oleo Integracao Exemplo",
      viscosity: "5W30",
      specifications: ["API SP"],
      unit: "frasco de 1 litro",
      priceCents: 4590,
    },
  ],
  source: "integration-test",
  createdBy: "vitest",
};

beforeAll(async () => {
  [previousProfile] = await database.select().from(businessProfile).limit(1);
});

afterAll(async () => {
  try {
    const savedProducts = await database
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.sku, [sku, concurrencySku]));
    if (savedProducts.length > 0) {
      const productIds = savedProducts.map((product) => product.id);
      await database
        .delete(productPrices)
        .where(inArray(productPrices.productId, productIds));
      await database.delete(products).where(inArray(products.id, productIds));
    }
    if (previousProfile) {
      await database
        .insert(businessProfile)
        .values(previousProfile)
        .onConflictDoUpdate({
          target: businessProfile.id,
          set: previousProfile,
        });
    } else {
      await database.delete(businessProfile).where(eq(businessProfile.id, 1));
    }
  } finally {
    await pool.end();
  }
});

it("keeps one current price while preserving superseded price history", async () => {
  const first = await importBusinessData(database, fixture);
  const second = await importBusinessData(database, fixture);
  const third = await importBusinessData(database, {
    ...fixture,
    products: [{ ...fixture.products[0], priceCents: 4990 }],
  });

  expect(first).toEqual({ importedProducts: 1, changedPrices: 1 });
  expect(second).toEqual({ importedProducts: 1, changedPrices: 0 });
  expect(third).toEqual({ importedProducts: 1, changedPrices: 1 });

  const [product] = await database
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, sku));
  const prices = await database
    .select({
      priceCents: productPrices.priceCents,
      validUntil: productPrices.validUntil,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, product.id))
    .orderBy(asc(productPrices.validFrom));

  expect(prices).toHaveLength(2);
  expect(prices[0]).toEqual({ priceCents: 4590, validUntil: expect.any(Date) });
  expect(prices[1]).toEqual({ priceCents: 4990, validUntil: null });
});

it("serializes concurrent imports at the product current-price boundary", async () => {
  const concurrentFixture: BusinessImport = {
    ...fixture,
    products: [{ ...fixture.products[0], sku: concurrencySku }],
  };

  const results = await Promise.all([
    importBusinessData(database, concurrentFixture),
    importBusinessData(database, concurrentFixture),
  ]);

  expect(results.map((result) => result.changedPrices).sort()).toEqual([0, 1]);

  const [product] = await database
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, concurrencySku));
  const currentPrices = await database
    .select({ id: productPrices.id })
    .from(productPrices)
    .where(
      and(
        eq(productPrices.productId, product.id),
        isNull(productPrices.validUntil),
      ),
    );

  expect(currentPrices).toHaveLength(1);
});
