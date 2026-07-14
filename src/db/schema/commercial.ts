import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const businessProfile = pgTable(
  "business_profile",
  {
    id: integer("id").primaryKey().default(1),
    businessName: text("business_name").notNull(),
    address: text("address"),
    openingHours: text("opening_hours"),
    paymentMethods: text("payment_methods")
      .array()
      .notNull()
      .default(sql`'{}'`),
    services: text("services").array().notNull().default(sql`'{}'`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("business_profile_singleton", sql`${table.id} = 1`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    sku: text("sku").notNull(),
    brand: text("brand").notNull(),
    name: text("name").notNull(),
    viscosity: text("viscosity"),
    specifications: text("specifications")
      .array()
      .notNull()
      .default(sql`'{}'`),
    unit: text("unit").notNull(),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("products_sku_unique").on(table.sku),
    index("products_lookup_idx").on(
      table.active,
      table.viscosity,
      table.brand,
    ),
  ],
);

export const productPrices = pgTable(
  "product_prices",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    priceCents: integer("price_cents").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    source: text("source").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("product_prices_positive", sql`${table.priceCents} > 0`),
    check(
      "product_prices_valid_range",
      sql`${table.validUntil} is null or ${table.validUntil} > ${table.validFrom}`,
    ),
    index("product_prices_product_idx").on(table.productId),
    uniqueIndex("product_prices_one_current_idx")
      .on(table.productId)
      .where(sql`${table.validUntil} is null`),
  ],
);

export type BusinessProfile = typeof businessProfile.$inferSelect;
export type NewBusinessProfile = typeof businessProfile.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductPrice = typeof productPrices.$inferSelect;
export type NewProductPrice = typeof productPrices.$inferInsert;
