import { env } from "@/config";
import { BadRequest } from "@/http/routes/_errors/bad-request";
import { gateway, transcribe } from "ai";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { readFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { Readable } from "stream";

async function downloadFile(mediaUrl: string) {
  const credentials = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
    "utf8",
  ).toString("base64");

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });
  if (!response.ok || !response.body) {
    throw new BadRequest("Failed to fetch media url");
  }

  const outputPath = `/tmp/audio-${randomUUID()}.mp3`;
  const bodyStream = Readable.fromWeb(response.body);
  await finished(bodyStream.pipe(createWriteStream(outputPath)));

  return outputPath;
}

export async function transcribeAudio(mediaUrl: string) {
  const outputPath = await downloadFile(mediaUrl);

  const result = await transcribe({
    model: gateway.transcriptionModel("xai/grok-stt"),
    audio: await readFile(outputPath),
  });

  console.log(`Audio duration: ${result.durationInSeconds} seconds`);
  return result.text;
}
