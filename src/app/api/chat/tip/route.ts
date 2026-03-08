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

    const { conversationId, amount } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        modelProfile: { select: { userId: true, name: true } },
      },
    });

    if (!conversation || conversation.clientId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const payment = await processPayment(
      session.user.id,
      conversation.modelProfile.userId,
      amount,
      "TIP",
      conversationId
    );

    if (!payment.success) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    const tipMessage = await prisma.message.create({
      data: {
        conversationId,
        senderType: "CLIENT",
        content: `💰 Sent a $${amount.toFixed(2)} tip!`,
      },
    });

    return NextResponse.json({
      success: true,
      message: tipMessage,
      transactionId: payment.transactionId,
    });
  } catch (error) {
    console.error("Tip error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
