import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string(),
  AI_GATEWAY_API_KEY: z.string(),
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_NUMBER: z.string(),
  TAVILY_API_KEY: z.string(),
});

export const env = envSchema.parse(process.env);
