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

    const { contentId } = await request.json();

    const content = await prisma.contentPost.findUnique({
      where: { id: contentId },
      include: { modelProfile: { select: { userId: true } } },
    });

    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const price = Number(content.price);
    if (price <= 0) {
      return NextResponse.json({ error: "Content is free" }, { status: 400 });
    }

    const payment = await processPayment(
      session.user.id,
      content.modelProfile.userId,
      price,
      "CONTENT_UNLOCK",
      contentId
    );

    if (!payment.success) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, transactionId: payment.transactionId });
  } catch (error) {
    console.error("Unlock error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
