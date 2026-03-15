import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;

  const comments = await prisma.postComment.findMany({
    where: { postId },
    include: { user: { select: { id: true, username: true, avatar: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(comments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: postId } = await params;
  const { content } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const comment = await prisma.postComment.create({
    data: {
      userId: session.user.id,
      postId,
      content: content.trim(),
    },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  return NextResponse.json(comment);
}
