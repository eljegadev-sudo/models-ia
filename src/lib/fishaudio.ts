import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const FISH_API_URL = "https://api.fish.audio/v1/tts";
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";

export async function generateVoiceMessage(
  text: string,
  voiceModelId?: string
): Promise<string> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) throw new Error("FISH_AUDIO_API_KEY not set");

  const referenceId = voiceModelId || process.env.FISH_AUDIO_VOICE_MODEL;
  if (!referenceId) throw new Error("No voice model ID provided");

  const response = await fetch(FISH_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "model": "s1",
    },
    body: JSON.stringify({
      reference_id: referenceId,
      text,
      format: "mp3",
      speed: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fish Audio API error (${response.status}): ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const dir = path.join(UPLOAD_DIR, "voice");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const filename = `${uuidv4()}.mp3`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, audioBuffer);

  return `/uploads/voice/${filename}`;
}
