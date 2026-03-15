import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
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

    if (videoGen.contentStatus !== "APPROVED") {
      return NextResponse.json(
        { error: "El video debe estar aprobado para publicar" },
        { status: 400 }
      );
    }

    if (!videoGen.videoUrl) {
      return NextResponse.json({ error: "Video sin URL" }, { status: 400 });
    }

    const post = await prisma.contentPost.create({
      data: {
        modelProfileId: videoGen.modelProfileId,
        imageUrl: null,
        videoUrl: videoGen.videoUrl,
        contentType: "REEL",
        caption: videoGen.prompt,
        promptUsed: videoGen.prompt,
        status: "PENDING",
        isPrivate: false,
        price: 0,
      },
    });

    return NextResponse.json({
      success: true,
      postId: post.id,
      message: "Reel creado. Aparecera en Contenido para aprobacion final.",
    });
  } catch (error) {
    console.error("Publish video error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
