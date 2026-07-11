import { getAgent } from "@/ai/agent";
import { transcribeAudio } from "@/helpers/transcribe";
import { messager } from "@/lib/twilio";
import { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { HumanMessage } from "langchain";
import { z } from "zod";
import { BadRequest } from "./_errors/bad-request";

const bodySchema = z.object({
  WaId: z.string().describe("User WhatsApp ID to reply to"),
  ProfileName: z.string().describe("User display name for personalization"),
  Body: z.string().describe("The text message sent by the user"),
  MessageType: z
    .enum(["text", "audio"])
    .describe("Used to ensure we only process text messages for now"),
  NumMedia: z.coerce.number().describe("Number of media files (1 for audio)"),
  MediaUrl0: z.string().url().optional().describe("The URL of the audio file"),
});

export const webhook: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/webhook",
    { schema: { body: bodySchema } },
    async (request, reply) => {
      const { WaId, MessageType, Body, MediaUrl0 } = request.body;

      const userMessage = await (async () => {
        switch (MessageType) {
          case "text":
            return Body;
          case "audio":
            if (!MediaUrl0)
              throw new BadRequest("Audio message without media url");
            return transcribeAudio(MediaUrl0);
          default:
            throw new BadRequest(`Unsupported message type: ${MessageType}`);
        }
      })();

      const agent = await getAgent();

      const res = await agent.invoke(
        {
          messages: [new HumanMessage(userMessage)],
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
