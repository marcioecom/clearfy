import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebhook } from "./webhook";

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function webhookBody(overrides: Record<string, unknown> = {}) {
  return {
    WaId: "5563999999999",
    ProfileName: "Cliente",
    Body: "Quero trocar o óleo",
    MessageType: "text",
    NumMedia: 0,
    ...overrides,
  };
}

function buildApp(dependencies: Parameters<typeof createWebhook>[0]) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  apps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(createWebhook(dependencies));
  return app;
}

describe("WhatsApp webhook", () => {
  it("sends a text agent response in the same WhatsApp thread", async () => {
    const agent = {
      invoke: vi.fn().mockResolvedValue({
        messages: [{ content: "  Resposta válida  " }],
      }),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({
      getAgent: vi.fn().mockResolvedValue(agent),
      sendMessage,
      transcribeAudio: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: webhookBody(),
    });

    expect(response.statusCode).toBe(204);
    expect(agent.invoke).toHaveBeenCalledWith(expect.anything(), {
      configurable: { thread_id: "5563999999999" },
      metadata: { thread_id: "5563999999999" },
    });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      toNumber: "5563999999999",
      body: "Resposta válida",
    });
  });

  it("transcribes an audio webhook before invoking the agent", async () => {
    const agent = {
      invoke: vi.fn().mockResolvedValue({
        messages: [{ content: [{ type: "text", text: "Resposta em áudio" }] }],
      }),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const transcribeAudio = vi.fn().mockResolvedValue("Áudio transcrito");
    const app = buildApp({
      getAgent: vi.fn().mockResolvedValue(agent),
      sendMessage,
      transcribeAudio,
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: webhookBody({
        MessageType: "audio",
        NumMedia: 1,
        MediaUrl0: "https://api.twilio.com/audio.mp3",
      }),
    });

    expect(response.statusCode).toBe(204);
    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(transcribeAudio).toHaveBeenCalledWith(
      "https://api.twilio.com/audio.mp3",
    );
    expect(agent.invoke.mock.calls[0]?.[0].messages[0]?.content).toBe(
      "Áudio transcrito",
    );
    expect(sendMessage).toHaveBeenCalledWith({
      toNumber: "5563999999999",
      body: "Resposta em áudio",
    });
  });

  it("rejects audio without a media URL", async () => {
    const getAgent = vi.fn();
    const sendMessage = vi.fn();
    const transcribeAudio = vi.fn();
    const app = buildApp({ getAgent, sendMessage, transcribeAudio });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: webhookBody({ MessageType: "audio", NumMedia: 1 }),
    });

    expect(response.statusCode).toBe(400);
    expect(getAgent).not.toHaveBeenCalled();
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends one bounded fallback when the agent fails", async () => {
    const agent = {
      invoke: vi.fn().mockRejectedValue(new Error("database password leaked")),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({
      getAgent: vi.fn().mockResolvedValue(agent),
      sendMessage,
      transcribeAudio: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: webhookBody(),
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).not.toContain("database password leaked");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      toNumber: "5563999999999",
      body: "Não consegui consultar agora. O responsável confirma pra você quando estiver disponível.",
    });
  });

  it("uses the bounded fallback instead of sending an empty response", async () => {
    const agent = {
      invoke: vi.fn().mockResolvedValue({ messages: [{ content: undefined }] }),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({
      getAgent: vi.fn().mockResolvedValue(agent),
      sendMessage,
      transcribeAudio: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: webhookBody(),
    });

    expect(response.statusCode).toBe(204);
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      toNumber: "5563999999999",
      body: "Não consegui consultar agora. O responsável confirma pra você quando estiver disponível.",
    });
  });

  it("does not retry or expose an outbound send failure", async () => {
    const agent = {
      invoke: vi.fn().mockResolvedValue({
        messages: [{ content: "Resposta válida" }],
      }),
    };
    const sendMessage = vi
      .fn()
      .mockRejectedValue(new Error("Twilio credential leaked"));
    const app = buildApp({
      getAgent: vi.fn().mockResolvedValue(agent),
      sendMessage,
      transcribeAudio: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: webhookBody(),
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain("Twilio credential leaked");
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
