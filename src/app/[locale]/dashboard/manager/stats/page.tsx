import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { StatsDashboard } from "@/components/dashboard/stats-dashboard";

export default async function StatsPage() {
  const session = await auth();
  const locale = await getLocale();

  if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  const userId = session.user.id;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    models,
    allTransactions,
    recentTransactions,
    totalMessagesData,
    conversations,
  ] = await Promise.all([
    prisma.modelProfile.findMany({
      where: { userId },
      include: {
        subscriptions: {
          where: { status: "ACTIVE" },
          include: { client: { select: { id: true, username: true, avatar: true } } },
        },
        contentPosts: {
          where: { status: "APPROVED" },
          include: {
            _count: { select: { likes: true, comments: true, tips: true } },
            tips: { select: { amount: true } },
          },
        },
        referenceImages: { take: 1, orderBy: { orderIndex: "asc" } },
        _count: { select: { conversations: true, stories: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { toUserId: userId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, username: true, avatar: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { toUserId: userId, status: "COMPLETED", createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "asc" },
      select: { amount: true, type: true, createdAt: true },
    }),
    prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversation: { modelProfile: { userId } },
      },
      _count: { id: true },
    }),
    prisma.conversation.findMany({
      where: { modelProfile: { userId } },
      include: {
        client: { select: { id: true, username: true, avatar: true } },
        modelProfile: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  const revenueByDay: Record<string, number> = {};
  for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
    revenueByDay[d.toISOString().slice(0, 10)] = 0;
  }
  for (const tx of recentTransactions) {
    const day = new Date(tx.createdAt).toISOString().slice(0, 10);
    revenueByDay[day] = (revenueByDay[day] || 0) + Number(tx.amount);
  }

  const revenueByType: Record<string, number> = {};
  for (const tx of allTransactions) {
    revenueByType[tx.type] = (revenueByType[tx.type] || 0) + Number(tx.amount);
  }

  const clientMap = new Map<
    string,
    { id: string; username: string; avatar: string | null; totalSpent: number; messages: number; subscriptions: string[]; lastActive: Date | null }
  >();

  for (const tx of allTransactions) {
    const c = clientMap.get(tx.fromUser.id) || {
      id: tx.fromUser.id,
      username: tx.fromUser.username,
      avatar: tx.fromUser.avatar ?? null,
      totalSpent: 0,
      messages: 0,
      subscriptions: [],
      lastActive: null,
    };
    c.totalSpent += Number(tx.amount);
    if (!c.lastActive || tx.createdAt > c.lastActive) c.lastActive = tx.createdAt;
    clientMap.set(tx.fromUser.id, c);
  }

  for (const conv of conversations) {
    const c = clientMap.get(conv.client.id) || {
      id: conv.client.id,
      username: conv.client.username,
      avatar: conv.client.avatar ?? null,
      totalSpent: 0,
      messages: 0,
      subscriptions: [],
      lastActive: null,
    };
    c.messages += conv._count.messages;
    if (!c.subscriptions.includes(conv.modelProfile.name)) {
      c.subscriptions.push(conv.modelProfile.name);
    }
    const lastMsg = conv.messages[0]?.createdAt;
    if (lastMsg && (!c.lastActive || lastMsg > c.lastActive)) {
      c.lastActive = lastMsg;
    }
    clientMap.set(conv.client.id, c);
  }

  const topClients = Array.from(clientMap.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 20);

  const modelStats = models.map((m) => {
    const modelTxs = allTransactions.filter((tx) => {
      if (tx.referenceId === m.id) return true;
      return false;
    });
    const modelRevenue = allTransactions
      .filter((tx) => {
        const isSubForModel = m.subscriptions.some((s) => s.client.id === tx.fromUser.id) && tx.type === "SUBSCRIPTION";
        return isSubForModel || tx.referenceId === m.id;
      })
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

    const totalLikes = m.contentPosts.reduce((s, p) => s + p._count.likes, 0);
    const totalComments = m.contentPosts.reduce((s, p) => s + p._count.comments, 0);
    const totalTips = m.contentPosts.reduce((s, p) => s + p._count.tips, 0);
    const tipRevenue = m.contentPosts.reduce(
      (s, p) => s + p.tips.reduce((ts, t) => ts + Number(t.amount), 0),
      0
    );

    const modelConvs = conversations.filter((c) => c.modelProfile.id === m.id);
    const totalMessages = modelConvs.reduce((s, c) => s + c._count.messages, 0);

    return {
      id: m.id,
      name: m.name,
      imageUrl: m.referenceImages[0]?.imageUrl ?? null,
      subscribers: m.subscriptions.length,
      revenue: modelRevenue,
      posts: m.contentPosts.length,
      likes: totalLikes,
      comments: totalComments,
      tips: totalTips,
      tipRevenue,
      messages: totalMessages,
      conversations: m._count.conversations,
      stories: m._count.stories,
    };
  });

  const topPosts = models
    .flatMap((m) =>
      m.contentPosts
        .filter((p): p is typeof p & { imageUrl: string } => p.imageUrl != null)
        .map((p) => ({
          id: p.id,
          imageUrl: p.imageUrl,
          caption: p.caption,
          modelName: m.name,
          likes: p._count.likes,
          comments: p._count.comments,
          tips: p._count.tips,
          tipRevenue: p.tips.reduce((s, t) => s + Number(t.amount), 0),
        }))
    )
    .sort((a, b) => b.likes + b.tips - (a.likes + a.tips))
    .slice(0, 10);

  const totalRevenue = allTransactions.reduce((s, tx) => s + Number(tx.amount), 0);
  const totalSubscribers = models.reduce((s, m) => s + m.subscriptions.length, 0);
  const totalMessages = totalMessagesData.reduce((s, g) => s + g._count.id, 0);
  const totalPosts = models.reduce((s, m) => s + m.contentPosts.length, 0);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });

  return (
    <StatsDashboard
      overview={{
        totalRevenue,
        totalSubscribers,
        totalMessages,
        totalPosts,
        balance: Number(user?.balance ?? 0),
      }}
      revenueByDay={Object.entries(revenueByDay).map(([date, amount]) => ({ date, amount }))}
      revenueByType={Object.entries(revenueByType).map(([type, amount]) => ({ type, amount }))}
      topClients={topClients.map((c) => ({
        ...c,
        lastActive: c.lastActive?.toISOString() ?? null,
      }))}
      modelStats={modelStats}
      topPosts={topPosts}
    />
  );
}
