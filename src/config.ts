import * as z from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  AI_GATEWAY_API_KEY: z.string(),
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_NUMBER: z.string(),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  throw new Error(`Missing env vars:\n${z.prettifyError(result.error)}`);
}

export const env = result.data;
