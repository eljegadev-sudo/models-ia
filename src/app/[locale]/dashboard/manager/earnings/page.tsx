import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { EarningsDashboard } from "@/components/dashboard/earnings-dashboard";

export default async function EarningsPage() {
  const session = await auth();
  const locale = await getLocale();

  if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  const transactions = await prisma.transaction.findMany({
    where: { toUserId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      fromUser: { select: { username: true } },
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true },
  });

  const serialized = transactions.map((t) => ({
    ...t,
    amount: Number(t.amount),
  }));

  const totalEarnings = serialized.reduce((sum, t) => sum + t.amount, 0);

  return (
    <EarningsDashboard
      transactions={serialized}
      totalEarnings={totalEarnings}
      balance={Number(user?.balance ?? 0)}
    />
  );
}
