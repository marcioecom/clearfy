import { relations } from "drizzle-orm";
import { productPrices, products } from "./commercial";

export const productsRelations = relations(products, ({ many }) => ({
  prices: many(productPrices),
}));

export const productPricesRelations = relations(productPrices, ({ one }) => ({
  product: one(products, {
    fields: [productPrices.productId],
    references: [products.id],
  }),
}));
