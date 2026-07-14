import { conversationConfig } from "@/ai/conversation";
import { extractTextResponse } from "@/ai/response";
import { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { HumanMessage } from "langchain";
import { z } from "zod";

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

type WebhookAgent = {
  invoke: (
    input: { messages: HumanMessage[] },
    config: ReturnType<typeof conversationConfig>,
  ) => Promise<{ messages: Array<{ content: unknown }> }>;
};

type SendMessageInput = {
  toNumber: string;
  body: string;
};

type WebhookDependencies = {
  getAgent: () => Promise<WebhookAgent>;
  sendMessage: (input: SendMessageInput) => Promise<unknown>;
  transcribeAudio: (mediaUrl: string) => Promise<string>;
};

const fallback =
  "Não consegui consultar agora. O responsável confirma pra você quando estiver disponível.";

const productionDependencies: WebhookDependencies = {
  getAgent: async () => {
    const { getAgent } = await import("../../ai/agent.js");
    return getAgent() as unknown as WebhookAgent;
  },
  sendMessage: async (input) => {
    const { messager } = await import("../../lib/twilio.js");
    return messager.sendMessage(input);
  },
  transcribeAudio: async (mediaUrl) => {
    const { transcribeAudio } = await import("../../helpers/transcribe.js");
    return transcribeAudio(mediaUrl);
  },
};

export function createWebhook(
  dependencies: WebhookDependencies = productionDependencies,
): FastifyPluginAsyncZod {
  const { getAgent, sendMessage, transcribeAudio } = dependencies;

  return async (app) => {
    app.post(
      "/webhook",
      { schema: { body: bodySchema } },
      async (request, reply) => {
        const { WaId, MessageType, Body, MediaUrl0 } = request.body;

        let answer: string;
        try {
          let userMessage = Body;
          if (MessageType === "audio") {
            if (!MediaUrl0) return reply.code(400).send();
            userMessage = await transcribeAudio(MediaUrl0);
          }
          const agent = await getAgent();
          const res = await agent.invoke(
            {
              messages: [new HumanMessage(userMessage)],
            },
            conversationConfig(WaId),
          );
          answer = extractTextResponse(res.messages.at(-1)?.content);
        } catch (error) {
          request.log.error(error);
          answer = fallback;
        }

        try {
          await sendMessage({
            toNumber: WaId,
            body: answer,
          });
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send();
        }

        return reply.code(204).send();
      },
    );
  };
}

export const webhook = createWebhook();
