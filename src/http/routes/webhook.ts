import { messager } from "@/lib/twilio";
import { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";

const bodySchema = z.object({
  WaId: z.string().describe("User WhatsApp ID to reply to"),
  ProfileName: z.string().describe("User display name for personalization"),
  Body: z.string().describe("The text message sent by the user"),
  MessageType: z
    .enum([
      "text",
      "image",
      "video",
      "audio",
      "document",
      "location",
      "sticker",
    ])
    .describe("Used to ensure we only process text messages for now"),
});

export const webhook: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/webhook",
    {
      schema: { body: bodySchema },
    },
    async (request, reply) => {
      const { WaId, ProfileName } = request.body;

      await messager.sendMessage({
        toNumber: WaId,
        body: `Hello, ${ProfileName}`,
      });

      reply.send({ hello: "world" });
    },
  );
};
