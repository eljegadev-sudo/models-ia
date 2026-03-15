import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifySubscribers } from "@/lib/notifications";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modelProfileId = searchParams.get("modelProfileId");
  const manage = searchParams.get("manage") === "true";

  if (manage) {
    if (!modelProfileId) {
      return NextResponse.json({ error: "modelProfileId required for manage" }, { status: 400 });
    }
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stories = await prisma.story.findMany({
      where: { modelProfileId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { views: true } },
        views: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { story: false },
        },
      },
    });

    const storyViewers = await prisma.storyView.findMany({
      where: { storyId: { in: stories.map((s) => s.id) } },
      include: { story: false },
      orderBy: { createdAt: "desc" },
    });

    const viewerUserIds = [...new Set(storyViewers.map((v) => v.userId))];
    const viewerUsers = await prisma.user.findMany({
      where: { id: { in: viewerUserIds } },
      select: { id: true, username: true, avatar: true },
    });
    const userMap = new Map(viewerUsers.map((u) => [u.id, u]));

    const enriched = stories.map((s) => ({
      ...s,
      viewCount: s._count.views,
      viewers: storyViewers
        .filter((v) => v.storyId === s.id)
        .slice(0, 10)
        .map((v) => userMap.get(v.userId))
        .filter(Boolean),
    }));

    return NextResponse.json(enriched);
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
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      modelProfile: {
        select: {
          id: true,
          name: true,
          slug: true,
          referenceImages: { take: 1, orderBy: { orderIndex: "asc" }, select: { imageUrl: true } },
        },
      },
    },
  });

  return NextResponse.json(stories);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId, status } = await request.json();

  const oldStory = await prisma.story.findUnique({
    where: { id: storyId },
    select: { status: true, modelProfileId: true, imageUrl: true },
  });

  const story = await prisma.story.update({
    where: { id: storyId },
    data: { status },
  });

  if (oldStory && oldStory.status !== "APPROVED" && status === "APPROVED") {
    const model = await prisma.modelProfile.findUnique({
      where: { id: oldStory.modelProfileId },
      select: { name: true, slug: true },
    });
    notifySubscribers(
      oldStory.modelProfileId,
      "new_story",
      `${model?.name || "Modelo"} subio una nueva story`,
      "Mira su story antes de que expire",
      oldStory.imageUrl,
      model?.slug ? `/model/${model.slug}` : undefined
    ).catch(console.error);
  }

  return NextResponse.json(story);
}
