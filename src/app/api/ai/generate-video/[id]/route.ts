import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retrieveVideo } from "@/lib/venice";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const videoGen = await prisma.videoGeneration.findUnique({
      where: { id },
      include: { modelProfile: { select: { userId: true } } },
    });

    if (!videoGen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (videoGen.modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (videoGen.status === "completed" && videoGen.videoUrl) {
      return NextResponse.json({
        id: videoGen.id,
        status: "completed",
        videoUrl: videoGen.videoUrl,
        contentStatus: videoGen.contentStatus,
        progress: 100,
      });
    }

    if (videoGen.status === "failed") {
      return NextResponse.json({
        id: videoGen.id,
        status: "failed",
        error: "Video generation failed",
      });
    }

    const result = await retrieveVideo(videoGen.queueId!, videoGen.model);

    if (result.status === "completed" && result.videoBuffer) {
      const videoDir = path.join(UPLOAD_DIR, "videos");
      if (!existsSync(videoDir)) {
        await mkdir(videoDir, { recursive: true });
      }

      const filename = `${uuidv4()}.mp4`;
      const filepath = path.join(videoDir, filename);
      await writeFile(filepath, result.videoBuffer);

      const videoUrl = `/uploads/videos/${filename}`;

      const updated = await prisma.videoGeneration.update({
        where: { id },
        data: { status: "completed", videoUrl },
      });

      return NextResponse.json({
        id: videoGen.id,
        status: "completed",
        videoUrl,
        contentStatus: updated.contentStatus,
        progress: 100,
      });
    }

    return NextResponse.json({
      id: videoGen.id,
      status: result.status,
      progress: result.progress || 0,
    });
  } catch (error) {
    console.error("Video status check error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { contentStatus } = body;

    if (!["PENDING", "APPROVED", "REJECTED"].includes(contentStatus)) {
      return NextResponse.json({ error: "Invalid contentStatus" }, { status: 400 });
    }

    const videoGen = await prisma.videoGeneration.findUnique({
      where: { id },
      include: { modelProfile: { select: { userId: true } } },
    });

    if (!videoGen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (videoGen.modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (videoGen.status !== "completed" || !videoGen.videoUrl) {
      return NextResponse.json(
        { error: "Solo se puede aprobar/rechazar videos completados" },
        { status: 400 }
      );
    }

    const updated = await prisma.videoGeneration.update({
      where: { id },
      data: { contentStatus },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Video update error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
