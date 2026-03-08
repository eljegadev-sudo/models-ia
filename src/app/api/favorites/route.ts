import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const favorites = await prisma.favorite.findMany({
      where: { userId: session.user.id },
      include: {
        modelProfile: {
          select: {
            id: true,
            slug: true,
            name: true,
            age: true,
            nationality: true,
            bio: true,
            subscriptionPrice: true,
            referenceImages: {
              take: 1,
              orderBy: { orderIndex: "asc" },
            },
            _count: { select: { subscriptions: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      favorites.map((f) => ({
        ...f.modelProfile,
        subscriptionPrice: Number(f.modelProfile.subscriptionPrice),
        subscriberCount: f.modelProfile._count.subscriptions,
        coverImage: f.modelProfile.referenceImages[0]?.imageUrl || null,
        favoritedAt: f.createdAt,
      }))
    );
  } catch (error) {
    console.error("Get favorites error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelProfileId } = await request.json();

    if (!modelProfileId) {
      return NextResponse.json({ error: "Model ID required" }, { status: 400 });
    }

    const existing = await prisma.favorite.findUnique({
      where: {
        userId_modelProfileId: {
          userId: session.user.id,
          modelProfileId,
        },
      },
    });

    if (existing) {
      await prisma.favorite.delete({
        where: { id: existing.id },
      });
      return NextResponse.json({ favorited: false });
    }

    await prisma.favorite.create({
      data: {
        userId: session.user.id,
        modelProfileId,
      },
    });

    return NextResponse.json({ favorited: true });
  } catch (error) {
    console.error("Toggle favorite error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
