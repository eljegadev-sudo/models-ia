import { prisma } from "./prisma";
import { TransactionType } from "@prisma/client";

export async function processPayment(
  fromUserId: string,
  toUserId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  messageId?: string
): Promise<{ success: boolean; error?: string; transactionId?: string }> {
  const fromUser = await prisma.user.findUnique({
    where: { id: fromUserId },
    select: { balance: true },
  });

  if (!fromUser) return { success: false, error: "User not found" };

  if (Number(fromUser.balance) < amount) {
    return { success: false, error: "Insufficient funds" };
  }

  const transaction = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: fromUserId },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: toUserId },
      data: { balance: { increment: amount } },
    });

    return tx.transaction.create({
      data: {
        fromUserId,
        toUserId,
        type,
        amount,
        referenceId,
        messageId,
        status: "COMPLETED",
      },
    });
  });

  return { success: true, transactionId: transaction.id };
}

export async function addFunds(userId: string, amount: number) {
  return prisma.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });
}

export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  return Number(user?.balance ?? 0);
}

export async function getTransactionHistory(userId: string) {
  return prisma.transaction.findMany({
    where: {
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      fromUser: { select: { username: true } },
      toUser: { select: { username: true } },
    },
  });
}
