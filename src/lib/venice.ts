import OpenAI from "openai";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
const VENICE_API_KEY = process.env.VENICE_API_KEY || "";

export const venice = new OpenAI({
  baseURL: VENICE_BASE_URL,
  apiKey: VENICE_API_KEY,
});

export const CHAT_MODELS = {
  "venice-uncensored": {
    id: "venice-uncensored",
    name: "Venice Uncensored 1.1",
    inputPrice: "$0.20",
    outputPrice: "$0.90",
    context: "32K",
    description: "Mas rapido y barato, sin censura total",
  },
  "llama-3.3-70b": {
    id: "llama-3.3-70b",
    name: "Llama 3.3 70B",
    inputPrice: "$0.70",
    outputPrice: "$2.80",
    context: "128K",
    description: "Equilibrio calidad/precio, muy bueno para roleplay",
  },
  "hermes-3-llama-3.1-405b": {
    id: "hermes-3-llama-3.1-405b",
    name: "Hermes 3 405B",
    inputPrice: "$1.10",
    outputPrice: "$3.00",
    context: "128K",
    description: "Maximo poder, mejor calidad de respuesta",
  },
} as const;

export type ChatModelId = keyof typeof CHAT_MODELS;

export const UTILITY_MODEL = "hermes-3-llama-3.1-405b";

export const DEFAULT_CHAT_MODEL: ChatModelId = "llama-3.3-70b";

export function getChatModelList() {
  return Object.values(CHAT_MODELS).map((m) => ({
    id: m.id,
    name: m.name,
    inputPrice: m.inputPrice,
    outputPrice: m.outputPrice,
    description: m.description,
  }));
}

const VIDEO_API_BASE = `${VENICE_BASE_URL.replace("/v1", "")}/v1`;

const VALID_DURATIONS = ["5s", "6s", "8s", "10s", "15s", "18s"] as const;

const MODELS_NO_ASPECT_RATIO = new Set(["kling-o3-pro-image-to-video", "kling-o3-pro-text-to-video"]);
const MODELS_NO_RESOLUTION = new Set(["kling-o3-pro-image-to-video", "kling-o3-pro-text-to-video"]);

function modelSupportsAspectRatio(model: string): boolean {
  return !MODELS_NO_ASPECT_RATIO.has(model);
}
function modelSupportsResolution(model: string): boolean {
  return !MODELS_NO_RESOLUTION.has(model);
}

export async function quoteVideo(params: {
  model?: string;
  duration: string;
  resolution?: string;
  aspectRatio?: string;
}): Promise<number> {
  const model = params.model || "wan-2.6-image-to-video";
  const duration = VALID_DURATIONS.includes(params.duration as (typeof VALID_DURATIONS)[number])
    ? params.duration
    : "5s";

  const payload: Record<string, unknown> = {
    model,
    duration,
  };
  if (params.resolution && modelSupportsResolution(model)) payload.resolution = params.resolution;
  if (params.aspectRatio && modelSupportsAspectRatio(model)) payload.aspect_ratio = params.aspectRatio;

  const resp = await fetch(`${VIDEO_API_BASE}/video/quote`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data.quote;
}

export async function queueVideo(params: {
  model?: string;
  prompt: string;
  duration: string;
  imageUrl: string;
  resolution?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  audio?: boolean;
}): Promise<{ queueId: string; model: string }> {
  const model = params.model || "wan-2.6-image-to-video";
  const duration = VALID_DURATIONS.includes(params.duration as (typeof VALID_DURATIONS)[number])
    ? params.duration
    : "5s";

  const payload: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    duration,
    image_url: params.imageUrl,
    audio: params.audio ?? false,
  };
  if (params.resolution && modelSupportsResolution(model)) payload.resolution = params.resolution;
  if (params.aspectRatio && modelSupportsAspectRatio(model)) payload.aspect_ratio = params.aspectRatio;
  if (params.negativePrompt) payload.negative_prompt = params.negativePrompt;

  const resp = await fetch(`${VIDEO_API_BASE}/video/queue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return { queueId: data.queue_id, model: data.model };
}

export async function retrieveVideo(
  queueId: string,
  model: string
): Promise<{ status: string; videoBuffer?: Buffer; progress?: number }> {
  const resp = await fetch(`${VIDEO_API_BASE}/video/retrieve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      queue_id: queueId,
      model,
      delete_media_on_completion: true,
    }),
  });

  const contentType = resp.headers.get("content-type") || "";

  if (contentType.includes("video/")) {
    const arrayBuffer = await resp.arrayBuffer();
    return { status: "completed", videoBuffer: Buffer.from(arrayBuffer) };
  }

  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));

  const avgMs = data.average_execution_time || 0;
  const curMs = data.execution_duration || 0;
  const progress = avgMs > 0 ? Math.min(100, Math.round((curMs / avgMs) * 100)) : 0;

  return { status: data.status || "processing", progress };
}
