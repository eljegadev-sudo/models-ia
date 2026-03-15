import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: storyId } = await params;

  await prisma.storyView.upsert({
    where: {
      storyId_userId: { storyId, userId: session.user.id },
    },
    update: {},
    create: { storyId, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
