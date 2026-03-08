import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const post = await prisma.contentPost.findUnique({
      where: { id },
      include: { modelProfile: { select: { userId: true } } },
    });

    if (!post || post.modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.contentPost.update({
      where: { id },
      data: {
        status: body.status,
        isPrivate: body.isPrivate,
        price: body.price,
        caption: body.caption,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update content error:", error);
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

    const post = await prisma.contentPost.findUnique({
      where: { id },
      include: { modelProfile: { select: { userId: true } } },
    });

    if (!post || post.modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.contentPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete content error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
