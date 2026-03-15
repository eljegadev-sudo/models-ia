/**
 * Cliente HTTP para el microservicio Photonic (generate_photonic.py via FastAPI o RunPod Serverless).
 * Genera imagenes NSFW con Photonic Fusion SDXL + FaceSwap + GFPGAN.
 *
 * Soporta dos modos:
 *  - FastAPI local:  PHOTONIC_SERVER_URL=http://localhost:8100
 *  - RunPod:         PHOTONIC_SERVER_URL=https://api.runpod.ai/v2/{endpoint_id}
 *                    RUNPOD_API_KEY=rpa_...
 */

const PHOTONIC_URL = process.env.PHOTONIC_SERVER_URL || "http://localhost:8100";
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || "";

export type PhotonicMode = "faceid" | "txt2img" | "img2img";

export interface PhotonicOptions {
  mode?: PhotonicMode;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  faceStrength?: number;
  sScale?: number;
  strength?: number;
  faceswap?: boolean;
  restore?: boolean;
  fidelity?: number;
}

export interface PhotonicResult {
  image: string;
  rawImage?: string;
  elapsedSeconds: number;
}

function isRunPodUrl(url: string): boolean {
  return url.includes("api.runpod.ai");
}

/**
 * Llama al endpoint RunPod Serverless de forma asincrona con polling.
 * Usa /run (async) y despues /status/{id} hasta que termine.
 */
async function callRunPod(
  baseUrl: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!RUNPOD_API_KEY) {
    throw new Error("RUNPOD_API_KEY no configurado");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${RUNPOD_API_KEY}`,
  };

  // Enviar job asincrono
  const submitResp = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input: payload }),
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`RunPod submit error ${submitResp.status}: ${err}`);
  }

  const submitted = await submitResp.json() as { id: string; status: string };
  const jobId = submitted.id;

  if (!jobId) {
    throw new Error("RunPod no devolvio job ID");
  }

  console.log(`[photonic] RunPod job enviado: ${jobId}`);

  // Polling hasta que el job termine (max 25 minutos, cubre primer cold start + descarga modelos)
  const maxWaitMs = 25 * 60 * 1000;
  const startTime = Date.now();
  let pollInterval = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 15000);

    const statusResp = await fetch(`${baseUrl}/status/${jobId}`, { headers });
    if (!statusResp.ok) continue;

    const status = await statusResp.json() as {
      id: string;
      status: string;
      output?: Record<string, unknown>;
      error?: string;
    };

    console.log(`[photonic] RunPod job ${jobId} status: ${status.status}`);

    if (status.status === "COMPLETED") {
      if (!status.output) throw new Error("RunPod job completado sin output");
      return status.output;
    }

    if (status.status === "FAILED") {
      throw new Error(`RunPod job fallido: ${status.error ?? "error desconocido"}`);
    }

    if (status.status === "CANCELLED") {
      throw new Error("RunPod job cancelado");
    }
  }

  throw new Error("RunPod job timeout (>10 min)");
}

/**
 * Llama al microservicio FastAPI local/remoto.
 */
async function callFastAPI(
  url: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${url}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Photonic error ${resp.status}: ${err}`);
  }

  return await resp.json();
}

export async function generateNSFWImage(
  prompt: string,
  refImageBase64: string | null,
  options: PhotonicOptions = {}
): Promise<PhotonicResult> {
  const payload: Record<string, unknown> = {
    prompt,
    mode: options.mode || "faceid",
    width: options.width || 1024,
    height: options.height || 1024,
    steps: options.steps || 35,
    guidance: options.guidance ?? 5.5,
    faceswap: options.faceswap ?? true,
    restore: options.restore ?? true,
    fidelity: options.fidelity ?? 0.5,
    face_strength: options.faceStrength ?? 0.4,
    s_scale: options.sScale ?? 4.5,
    strength: options.strength ?? 0.65,
  };

  if (refImageBase64) {
    payload.ref_image = refImageBase64;
  }
  if (options.negativePrompt) {
    payload.negative_prompt = options.negativePrompt;
  }
  if (options.seed !== undefined) {
    payload.seed = options.seed;
  }

  let data: Record<string, unknown>;

  if (isRunPodUrl(PHOTONIC_URL)) {
    data = await callRunPod(PHOTONIC_URL, payload);
  } else {
    data = await callFastAPI(PHOTONIC_URL, payload);
  }

  if (data.error) {
    throw new Error(`Photonic error: ${data.error}`);
  }

  return {
    image: data.image as string,
    rawImage: (data.raw_image as string | undefined) || undefined,
    elapsedSeconds: (data.elapsed_seconds as number) ?? 0,
  };
}

export async function checkPhotonicHealth(): Promise<boolean> {
  try {
    if (isRunPodUrl(PHOTONIC_URL)) {
      // Para RunPod, verificamos que la URL y API key existan
      return !!(PHOTONIC_URL && RUNPOD_API_KEY);
    }
    const resp = await fetch(`${PHOTONIC_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
