import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveUploadedFile(
  file: File,
  subfolder: string = "general"
): Promise<string> {
  const dir = path.join(UPLOAD_DIR, subfolder);
  await ensureDir(dir);

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${uuidv4()}.${ext}`;
  const filepath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return `/uploads/${subfolder}/${filename}`;
}

export async function saveImageFromUrl(
  url: string,
  subfolder: string = "generated"
): Promise<string> {
  const dir = path.join(UPLOAD_DIR, subfolder);
  await ensureDir(dir);

  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());

  const filename = `${uuidv4()}.png`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, buffer);

  return `/uploads/${subfolder}/${filename}`;
}

export async function saveImageFromBase64(
  base64Data: string,
  subfolder: string = "generated"
): Promise<string> {
  const dir = path.join(UPLOAD_DIR, subfolder);
  await ensureDir(dir);

  const buffer = Buffer.from(base64Data, "base64");
  const filename = `${uuidv4()}.png`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, buffer);

  return `/uploads/${subfolder}/${filename}`;
}
