import { env } from "@/config";
import { makeWSNum } from "@/helpers/ws-num";
import twilio, { Twilio } from "twilio";

export const twilioClient = twilio(
  env.TWILIO_ACCOUNT_SID,
  env.TWILIO_AUTH_TOKEN,
);

type SendMessageInput = {
  toNumber: string;
  body: string;
};

class TwilioMessager {
  constructor(private client: Twilio = twilioClient) {}

  public async sendMessage({ toNumber, body }: SendMessageInput) {
    const sendTo = toNumber.startsWith("whatsapp:")
      ? toNumber
      : makeWSNum(toNumber);

    const result = await this.client.messages.create({
      to: sendTo,
      from: makeWSNum(env.TWILIO_NUMBER),
      body,
    });

    return result;
  }
}

export const messager = new TwilioMessager();
