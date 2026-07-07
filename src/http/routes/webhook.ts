import { z } from "zod";
import { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { messager } from "@/lib/twilio";
import { getAgent } from "@/agent";
import { HumanMessage } from "langchain";

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
      const { WaId, ProfileName, Body } = request.body;

      request.log.info(
        { waId: WaId, name: ProfileName },
        "processing webhook event",
      );

      const agent = await getAgent();

      const res = await agent.invoke(
        {
          messages: [new HumanMessage(Body)],
        },
        { configurable: { thread_id: WaId } },
      );
      const answer = res.messages.at(-1)?.content;

      await messager.sendMessage({
        toNumber: WaId,
        body: `${answer}`,
      });

      reply.send({ hello: "world" });
    },
  );
};
