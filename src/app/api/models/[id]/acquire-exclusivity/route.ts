import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processPayment } from "@/lib/payments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: modelProfileId } = await params;

    const model = await prisma.modelProfile.findUnique({
      where: { id: modelProfileId },
      select: {
        userId: true,
        exclusiveOwnerId: true,
        exclusivityPrice: true,
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    if (model.exclusiveOwnerId) {
      return NextResponse.json(
        { error: "Esta modelo ya fue adquirida por otro usuario" },
        { status: 400 }
      );
    }

    const price = Number(model.exclusivityPrice ?? 0);
    if (price <= 0) {
      return NextResponse.json(
        { error: "Esta modelo no esta disponible para exclusividad" },
        { status: 400 }
      );
    }

    if (model.userId === session.user.id) {
      return NextResponse.json(
        { error: "No puedes adquirir tu propia modelo" },
        { status: 400 }
      );
    }

    const payment = await processPayment(
      session.user.id,
      model.userId,
      price,
      "EXCLUSIVITY",
      modelProfileId
    );

    if (!payment.success) {
      return NextResponse.json(
        { error: payment.error || "Error al procesar el pago" },
        { status: 400 }
      );
    }

    await prisma.modelProfile.update({
      where: { id: modelProfileId },
      data: { exclusiveOwnerId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Acquire exclusivity error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
