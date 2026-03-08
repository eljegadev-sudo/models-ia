import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { modelProfileId, imageUrl, caption, isPrivate, price, promptUsed } = body;

    const model = await prisma.modelProfile.findUnique({
      where: { id: modelProfileId },
      select: { userId: true },
    });

    if (!model || model.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const post = await prisma.contentPost.create({
      data: {
        modelProfileId,
        imageUrl,
        caption,
        isPrivate: isPrivate || false,
        price: price || 0,
        promptUsed,
        status: "PENDING",
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error("Create content error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
