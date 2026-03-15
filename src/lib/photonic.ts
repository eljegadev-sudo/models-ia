/**
 * Cliente HTTP para el microservicio Photonic (generate_photonic.py via FastAPI).
 * Genera imagenes NSFW con Photonic Fusion SDXL + FaceSwap + GFPGAN.
 */

const PHOTONIC_URL = process.env.PHOTONIC_SERVER_URL || "http://localhost:8100";

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

  const resp = await fetch(`${PHOTONIC_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Photonic error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return {
    image: data.image,
    rawImage: data.raw_image || undefined,
    elapsedSeconds: data.elapsed_seconds,
  };
}

export async function checkPhotonicHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${PHOTONIC_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}
