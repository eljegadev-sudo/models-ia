import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processPayment } from "@/lib/payments";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId } = await request.json();

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            modelProfile: { select: { userId: true } },
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.conversation.clientId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!message.isPaidContent || message.isUnlocked) {
      return NextResponse.json({ error: "Already unlocked or free" }, { status: 400 });
    }

    const price = Number(message.price);
    const payment = await processPayment(
      session.user.id,
      message.conversation.modelProfile.userId,
      price,
      "MESSAGE_UNLOCK",
      undefined,
      messageId
    );

    if (!payment.success) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isUnlocked: true },
    });

    return NextResponse.json({ success: true, imageUrl: message.imageUrl });
  } catch (error) {
    console.error("Unlock message error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
