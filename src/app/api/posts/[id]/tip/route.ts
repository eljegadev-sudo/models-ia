import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: postId } = await params;
  const { amount } = await request.json();

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user || Number(user.balance) < amount) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    include: { modelProfile: { select: { userId: true } } },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const [tip] = await prisma.$transaction([
    prisma.postTip.create({
      data: { userId: session.user.id, postId, amount },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { decrement: amount } },
    }),
    prisma.user.update({
      where: { id: post.modelProfile.userId },
      data: { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        fromUserId: session.user.id,
        toUserId: post.modelProfile.userId,
        type: "TIP",
        amount,
        referenceId: postId,
      },
    }),
  ]);

  return NextResponse.json({ success: true, tip });
}
