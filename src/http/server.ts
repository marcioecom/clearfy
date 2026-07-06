import fastify from "fastify";
import { fastifyCors } from "@fastify/cors";
import { fastifyFormbody } from "@fastify/formbody";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import { env } from "@/config";
import { webhook } from "./routes/webhook";

const app = fastify().withTypeProvider<ZodTypeProvider>();

app.register(fastifyCors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
app.register(fastifyFormbody);

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(webhook);

app.listen({ port: env.PORT, host: "0.0.0.0" }).then(() => {
  console.log(`HTTP server running on http://localhost:${env.PORT}!`);
});
