import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MODEL_ID = "qwen/qwen-image-2-pro" as const;

export async function generateImageFromText(prompt: string): Promise<string> {
  const output = await replicate.run(MODEL_ID, {
    input: {
      prompt,
      aspect_ratio: "3:4",
      negative_prompt: "blurry, low quality, distorted, deformed hands, extra fingers, bad anatomy",
      enable_prompt_expansion: true,
    },
  });

  return extractUrl(output);
}

export async function generateImageFromImage(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const output = await replicate.run(MODEL_ID, {
    input: {
      prompt,
      image: imageUrl,
      aspect_ratio: "3:4",
      negative_prompt: "blurry, low quality, distorted, deformed hands, extra fingers, bad anatomy",
      enable_prompt_expansion: true,
      match_input_image: false,
    },
  });

  return extractUrl(output);
}

function extractUrl(output: unknown): string {
  if (typeof output === "string") return output;

  if (output && typeof output === "object" && "url" in output) {
    const fileOutput = output as { url: () => string };
    if (typeof fileOutput.url === "function") return fileOutput.url();
    return String(fileOutput.url);
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first) {
      const fileItem = first as { url: () => string };
      if (typeof fileItem.url === "function") return fileItem.url();
      return String(fileItem.url);
    }
  }

  return String(output);
}

export { replicate };
