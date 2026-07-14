import { db, type Database } from "@/db/client";
import { businessProfile, productPrices, products } from "@/db/schema";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  CommercialCatalog,
  type CatalogQueryPort,
  type OfferView,
} from "./catalog";

function createQueryPort(database: Database): CatalogQueryPort {
  return {
    async findProfile() {
      const [profile] = await database.select().from(businessProfile).limit(1);
      return profile ?? null;
    },
    async findOffers(query): Promise<OfferView[]> {
      const pattern = `%${query}%`;
      return database
        .select({
          sku: products.sku,
          brand: products.brand,
          name: products.name,
          viscosity: products.viscosity,
          specifications: products.specifications,
          unit: products.unit,
          priceCents: productPrices.priceCents,
          validFrom: productPrices.validFrom,
        })
        .from(products)
        .innerJoin(productPrices, eq(productPrices.productId, products.id))
        .where(
          and(
            eq(products.active, true),
            isNull(productPrices.validUntil),
            or(
              ilike(products.sku, pattern),
              ilike(products.brand, pattern),
              ilike(products.name, pattern),
              ilike(products.viscosity, pattern),
              sql`${products.specifications}::text ilike ${pattern}`,
            ),
          ),
        )
        .orderBy(products.brand, products.name)
        .limit(10);
    },
  };
}

export function createDrizzleCatalog(database: Database = db) {
  return new CommercialCatalog(createQueryPort(database));
}
