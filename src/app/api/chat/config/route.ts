import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, aiEnabled, eroticLevel } = await request.json();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        modelProfile: { select: { userId: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (conversation.modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(aiEnabled !== undefined && { aiEnabled }),
        ...(eroticLevel !== undefined && { eroticLevel: Math.min(5, Math.max(1, eroticLevel)) }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Chat config error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
