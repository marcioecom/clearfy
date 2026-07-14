import { z } from "zod";

const text = z.string().trim().min(1);

export const businessImportSchema = z
  .object({
    profile: z
      .object({
        businessName: text,
        address: text.optional(),
        openingHours: text.optional(),
        paymentMethods: z.array(text),
        services: z.array(text),
      })
      .strict(),
    products: z.array(
      z
        .object({
          sku: text,
          brand: text,
          name: text,
          viscosity: text.optional(),
          specifications: z.array(text),
          unit: text,
          priceCents: z.number().int().positive(),
        })
        .strict(),
    ),
    source: text,
    createdBy: text,
  })
  .strict();

export type BusinessImport = z.infer<typeof businessImportSchema>;
