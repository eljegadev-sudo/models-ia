import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const UPLOADS_BASE =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/data/uploads"
    : path.join(process.cwd(), "public", "uploads"));

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathParts } = await params;
    const filePath = path.join(UPLOADS_BASE, ...pathParts);

    // Prevent path traversal
    const resolved = path.resolve(filePath);
    const baseResolved = path.resolve(UPLOADS_BASE);
    if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const file = await readFile(resolved);
    const ext = (pathParts[pathParts.length - 1].split(".").pop() ?? "png").toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
