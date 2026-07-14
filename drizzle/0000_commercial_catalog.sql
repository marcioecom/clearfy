CREATE TABLE "business_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"business_name" text NOT NULL,
	"address" text,
	"opening_hours" text,
	"payment_methods" text[] DEFAULT '{}' NOT NULL,
	"services" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profile_singleton" CHECK ("business_profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_prices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"price_cents" integer NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"source" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_positive" CHECK ("product_prices"."price_cents" > 0),
	CONSTRAINT "product_prices_valid_range" CHECK ("product_prices"."valid_until" is null or "product_prices"."valid_until" > "product_prices"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sku" text NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"viscosity" text,
	"specifications" text[] DEFAULT '{}' NOT NULL,
	"unit" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_prices_product_idx" ON "product_prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_one_current_idx" ON "product_prices" USING btree ("product_id") WHERE "product_prices"."valid_until" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_lookup_idx" ON "products" USING btree ("active","viscosity","brand");