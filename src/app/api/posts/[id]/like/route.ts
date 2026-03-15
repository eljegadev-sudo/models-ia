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

  const { id: postId } = await params;

  const existing = await prisma.postLike.findUnique({
    where: { userId_postId: { userId: session.user.id, postId } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    const count = await prisma.postLike.count({ where: { postId } });
    return NextResponse.json({ liked: false, count });
  }

  await prisma.postLike.create({
    data: { userId: session.user.id, postId },
  });

  const count = await prisma.postLike.count({ where: { postId } });
  return NextResponse.json({ liked: true, count });
}
