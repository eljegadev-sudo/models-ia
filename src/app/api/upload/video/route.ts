import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Video file required" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "mp4";
    const videosDir = path.join(process.cwd(), "public", "uploads", "videos");
    await mkdir(videosDir, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(videosDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const videoUrl = `/uploads/videos/${filename}`;
    return NextResponse.json({ videoUrl });
  } catch (error) {
    console.error("Video upload error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
