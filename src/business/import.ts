import type { Database } from "@/db/client";
import { businessProfile, productPrices, products } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { BusinessImport } from "./import-schema";

export async function importBusinessData(
  database: Database,
  input: BusinessImport,
): Promise<{ importedProducts: number; changedPrices: number }> {
  return database.transaction(async (tx) => {
    await tx
      .insert(businessProfile)
      .values({
        id: 1,
        businessName: input.profile.businessName,
        address: input.profile.address ?? null,
        openingHours: input.profile.openingHours ?? null,
        paymentMethods: input.profile.paymentMethods,
        services: input.profile.services,
      })
      .onConflictDoUpdate({
        target: businessProfile.id,
        set: {
          businessName: input.profile.businessName,
          address: input.profile.address ?? null,
          openingHours: input.profile.openingHours ?? null,
          paymentMethods: input.profile.paymentMethods,
          services: input.profile.services,
          updatedAt: new Date(),
        },
      });

    let changedPrices = 0;
    for (const product of input.products) {
      const [saved] = await tx
        .insert(products)
        .values({
          sku: product.sku,
          brand: product.brand,
          name: product.name,
          viscosity: product.viscosity ?? null,
          specifications: product.specifications,
          unit: product.unit,
          active: true,
        })
        .onConflictDoUpdate({
          target: products.sku,
          set: {
            brand: product.brand,
            name: product.name,
            viscosity: product.viscosity ?? null,
            specifications: product.specifications,
            unit: product.unit,
            active: true,
            updatedAt: new Date(),
          },
        })
        .returning({ id: products.id });

      // Serialize the current-price decision for this product until commit.
      await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, saved.id))
        .for("update");

      const [current] = await tx
        .select({
          id: productPrices.id,
          priceCents: productPrices.priceCents,
          validFrom: productPrices.validFrom,
        })
        .from(productPrices)
        .where(
          and(
            eq(productPrices.productId, saved.id),
            isNull(productPrices.validUntil),
          ),
        )
        .limit(1);

      if (current?.priceCents === product.priceCents) continue;

      const changedAt = current
        ? new Date(Math.max(Date.now(), current.validFrom.getTime() + 1))
        : new Date();
      if (current) {
        await tx
          .update(productPrices)
          .set({ validUntil: changedAt })
          .where(
            and(
              eq(productPrices.id, current.id),
              isNull(productPrices.validUntil),
            ),
          );
      }
      await tx.insert(productPrices).values({
        productId: saved.id,
        priceCents: product.priceCents,
        validFrom: changedAt,
        source: input.source,
        createdBy: input.createdBy,
      });
      changedPrices += 1;
    }

    return { importedProducts: input.products.length, changedPrices };
  });
}
