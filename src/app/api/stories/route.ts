import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelProfileId = searchParams.get("modelProfileId");

    const session = await auth();
    const isManager = searchParams.get("manage") === "true";

    if (isManager) {
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (!modelProfileId) {
        return NextResponse.json({ error: "Model ID required" }, { status: 400 });
      }

      const model = await prisma.modelProfile.findUnique({
        where: { id: modelProfileId },
        select: { userId: true },
      });

      if (!model || model.userId !== session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const stories = await prisma.story.findMany({
        where: { modelProfileId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return NextResponse.json(stories);
    }

    const where: Record<string, unknown> = {
      status: "APPROVED",
      expiresAt: { gt: new Date() },
    };

    if (modelProfileId) {
      where.modelProfileId = modelProfileId;
    }

    const stories = await prisma.story.findMany({
      where,
      include: {
        modelProfile: {
          select: {
            id: true,
            name: true,
            slug: true,
            referenceImages: {
              take: 1,
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(stories);
  } catch (error) {
    console.error("Get stories error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyId, status } = await request.json();

    if (!storyId || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: { modelProfile: { select: { userId: true } } },
    });

    if (!story || story.modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.story.update({
      where: { id: storyId },
      data: { status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update story error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
