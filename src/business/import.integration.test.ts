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
const competingPricesSku = `IT-IMPORT-COMPETING-${randomUUID()}`;
const immutableUnitSku = `IT-IMPORT-UNIT-${randomUUID()}`;
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
      .where(
        inArray(products.sku, [
          sku,
          concurrencySku,
          competingPricesSku,
          immutableUnitSku,
        ]),
      );
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

it("keeps replay idempotent while preserving superseded price history", async () => {
  const first = await importBusinessData(database, fixture);
  const second = await importBusinessData(database, fixture);
  const [product] = await database
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, sku));
  const replayedPrices = await database
    .select({
      priceCents: productPrices.priceCents,
      validUntil: productPrices.validUntil,
      source: productPrices.source,
      createdBy: productPrices.createdBy,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, product.id));

  expect(second).toEqual({ importedProducts: 1, changedPrices: 0 });
  expect(replayedPrices).toEqual([
    {
      priceCents: 4590,
      validUntil: null,
      source: "integration-test",
      createdBy: "vitest",
    },
  ]);

  const third = await importBusinessData(database, {
    ...fixture,
    products: [{ ...fixture.products[0], priceCents: 4990 }],
    source: "reviewed-integration-test",
    createdBy: "reviewer-vitest",
  });

  expect(first).toEqual({ importedProducts: 1, changedPrices: 1 });
  expect(third).toEqual({ importedProducts: 1, changedPrices: 1 });

  const prices = await database
    .select({
      priceCents: productPrices.priceCents,
      validUntil: productPrices.validUntil,
      source: productPrices.source,
      createdBy: productPrices.createdBy,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, product.id))
    .orderBy(asc(productPrices.validFrom));

  expect(prices).toHaveLength(2);
  expect(prices[0]).toEqual({
    priceCents: 4590,
    validUntil: expect.any(Date),
    source: "integration-test",
    createdBy: "vitest",
  });
  expect(prices[1]).toEqual({
    priceCents: 4990,
    validUntil: null,
    source: "reviewed-integration-test",
    createdBy: "reviewer-vitest",
  });
});

it("rejects a changed unit for an existing SKU and rolls back the import", async () => {
  const initial: BusinessImport = {
    ...fixture,
    products: [{ ...fixture.products[0], sku: immutableUnitSku }],
  };
  await importBusinessData(database, initial);

  await expect(
    importBusinessData(database, {
      ...initial,
      profile: { ...initial.profile, businessName: "Alteracao deve reverter" },
      products: [
        {
          ...initial.products[0],
          brand: "Marca alterada",
          unit: "caixa com 12 frascos de 1 litro",
          priceCents: 5490,
        },
      ],
    }),
  ).rejects.toThrow(
    `Cannot change unit for SKU "${immutableUnitSku}" from "frasco de 1 litro" to "caixa com 12 frascos de 1 litro"`,
  );

  const [savedProduct] = await database
    .select({ id: products.id, brand: products.brand, unit: products.unit })
    .from(products)
    .where(eq(products.sku, immutableUnitSku));
  const prices = await database
    .select({ priceCents: productPrices.priceCents })
    .from(productPrices)
    .where(eq(productPrices.productId, savedProduct.id));
  const [profile] = await database.select().from(businessProfile).limit(1);

  expect(savedProduct).toMatchObject({
    brand: initial.products[0].brand,
    unit: initial.products[0].unit,
  });
  expect(prices).toEqual([{ priceCents: initial.products[0].priceCents }]);
  expect(profile.businessName).toBe(initial.profile.businessName);
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

it("preserves history when concurrent imports compete with different prices", async () => {
  const competingFixture: BusinessImport = {
    ...fixture,
    products: [{ ...fixture.products[0], sku: competingPricesSku }],
  };

  const results = await Promise.all([
    importBusinessData(database, {
      ...competingFixture,
      products: [{ ...competingFixture.products[0], priceCents: 6100 }],
      source: "competitor-a",
      createdBy: "vitest-a",
    }),
    importBusinessData(database, {
      ...competingFixture,
      products: [{ ...competingFixture.products[0], priceCents: 7200 }],
      source: "competitor-b",
      createdBy: "vitest-b",
    }),
  ]);

  expect(results).toEqual([
    { importedProducts: 1, changedPrices: 1 },
    { importedProducts: 1, changedPrices: 1 },
  ]);

  const [product] = await database
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, competingPricesSku));
  const prices = await database
    .select({
      priceCents: productPrices.priceCents,
      validUntil: productPrices.validUntil,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, product.id));

  expect(prices.map((price) => price.priceCents).sort()).toEqual([6100, 7200]);
  expect(prices.filter((price) => price.validUntil === null)).toHaveLength(1);
  expect(prices.filter((price) => price.validUntil !== null)).toHaveLength(1);
});
