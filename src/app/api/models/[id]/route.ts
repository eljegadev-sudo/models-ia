import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const model = await prisma.modelProfile.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        referenceImages: { orderBy: { orderIndex: "asc" } },
        contentPosts: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { subscriptions: true } },
        user: { select: { username: true } },
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...model,
      subscriptionPrice: Number(model.subscriptionPrice),
      subscriberCount: model._count.subscriptions,
      contentPosts: model.contentPosts.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
    });
  } catch (error) {
    console.error("Get model error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
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

    const model = await prisma.modelProfile.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!model || model.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.modelProfile.update({
      where: { id },
      data: {
        name: body.name,
        age: body.age,
        nationality: body.nationality,
        bio: body.bio,
        bodyType: body.bodyType,
        hairColor: body.hairColor,
        hairType: body.hairType,
        ethnicity: body.ethnicity,
        height: body.height,
        subscriptionPrice: body.subscriptionPrice,
        exclusivityPrice: body.exclusivityPrice !== undefined ? body.exclusivityPrice : undefined,
        chatPersonality: body.chatPersonality,
        backstory: body.backstory,
        chatAutomatic: body.chatAutomatic,
        eroticLevel: body.eroticLevel,
        isActive: body.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update model error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const model = await prisma.modelProfile.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!model || model.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.modelProfile.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete model error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
