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

    const { modelProfileId } = await request.json();

    const model = await prisma.modelProfile.findUnique({
      where: { id: modelProfileId },
      select: { userId: true, subscriptionPrice: true },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    if (model.userId === session.user.id) {
      return NextResponse.json({ error: "Cannot subscribe to own model" }, { status: 400 });
    }

    const existing = await prisma.subscription.findUnique({
      where: {
        clientId_modelProfileId: {
          clientId: session.user.id,
          modelProfileId,
        },
      },
    });

    if (existing?.status === "ACTIVE") {
      return NextResponse.json({ error: "Already subscribed" }, { status: 400 });
    }

    const price = Number(model.subscriptionPrice);
    const payment = await processPayment(
      session.user.id,
      model.userId,
      price,
      "SUBSCRIPTION",
      modelProfileId
    );

    if (!payment.success) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const subscription = existing
      ? await prisma.subscription.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", startedAt: new Date(), expiresAt },
        })
      : await prisma.subscription.create({
          data: {
            clientId: session.user.id,
            modelProfileId,
            status: "ACTIVE",
            expiresAt,
          },
        });

    return NextResponse.json(subscription, { status: 201 });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
