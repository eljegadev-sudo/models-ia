import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
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

    const count = await prisma.referenceImage.count({
      where: { modelProfileId: id },
    });

    if (count >= 5) {
      return NextResponse.json({ error: "Max 5 reference images" }, { status: 400 });
    }

    const ref = await prisma.referenceImage.create({
      data: {
        modelProfileId: id,
        imageUrl: body.imageUrl,
        isAiGenerated: body.isAiGenerated || false,
        prompt: body.prompt,
        orderIndex: body.orderIndex ?? count,
      },
    });

    return NextResponse.json(ref, { status: 201 });
  } catch (error) {
    console.error("Add reference error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
