import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queueVideo, quoteVideo } from "@/lib/venice";

/** Venice no puede acceder a localhost. Convierte imágenes locales a data URL (como generate_video_venice.py). */
async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:image/")) return imageUrl;

  if (imageUrl.startsWith("/uploads")) {
    const localPath = imageUrl.startsWith("/") ? imageUrl.slice(1) : imageUrl;
    const filePath = path.join(process.cwd(), "public", localPath);
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  const isLocal =
    imageUrl.startsWith("http://localhost") || imageUrl.startsWith("http://127.0.0.1");
  if (isLocal) {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`No se pudo cargar la imagen: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get("content-type") || "image/jpeg";
    const mime = ct.startsWith("image/") ? ct : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  return imageUrl;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelProfileId, imageUrl, prompt, duration, resolution, aspectRatio, model } =
      await request.json();

    if (!imageUrl || !prompt) {
      return NextResponse.json(
        { error: "imageUrl and prompt are required" },
        { status: 400 }
      );
    }

    const profile = await prisma.modelProfile.findFirst({
      where: { id: modelProfileId, userId: session.user.id },
    });
    if (!profile) {
      return NextResponse.json({ error: "Model profile not found" }, { status: 404 });
    }

    const selectedDuration = duration || "5s";
    const selectedModel = model || "wan-2.6-image-to-video";
    const selectedAspectRatio = aspectRatio || "16:9";

    const imageForVenice = await imageUrlToDataUrl(imageUrl);

    const quote = await quoteVideo({
      model: selectedModel,
      duration: selectedDuration,
      resolution,
      aspectRatio: selectedAspectRatio,
    });

    const result = await queueVideo({
      model: selectedModel,
      prompt,
      duration: selectedDuration,
      imageUrl: imageForVenice,
      resolution,
      aspectRatio: selectedAspectRatio,
    });

    const videoGen = await prisma.videoGeneration.create({
      data: {
        modelProfileId,
        sourceImageUrl: imageUrl,
        prompt,
        duration: selectedDuration,
        model: result.model,
        queueId: result.queueId,
        status: "processing",
        quoteCost: quote,
      },
    });

    return NextResponse.json({
      id: videoGen.id,
      queueId: result.queueId,
      model: result.model,
      quote,
      status: "processing",
    });
  } catch (error) {
    console.error("Video generation error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const modelProfileId = searchParams.get("modelProfileId");

    if (!modelProfileId) {
      return NextResponse.json({ error: "modelProfileId required" }, { status: 400 });
    }

    const videos = await prisma.videoGeneration.findMany({
      where: {
        modelProfileId,
        modelProfile: { userId: session.user.id },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(videos);
  } catch (error) {
    console.error("List videos error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
