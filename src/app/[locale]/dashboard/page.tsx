import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { CreatorDashboard } from "@/components/dashboard/creator-dashboard";

export default async function DashboardPage() {
  const session = await auth();
  const locale = await getLocale();

  if (!session?.user) {
    redirect({ href: "/auth/login", locale: locale as "es" | "en" });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      subscriptions: {
        where: { status: "ACTIVE" },
        include: {
          modelProfile: {
            include: {
              referenceImages: { take: 1, orderBy: { orderIndex: "asc" } },
            },
          },
        },
      },
      modelProfiles: {
        include: {
          subscriptions: { where: { status: "ACTIVE" } },
          referenceImages: { take: 1, orderBy: { orderIndex: "asc" } },
          _count: { select: { contentPosts: true } },
        },
      },
      sentTransactions: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      receivedTransactions: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!user) {
    redirect({ href: "/auth/login", locale: locale as "es" | "en" });
    return null;
  }

  const serializedUser = {
    ...user,
    balance: Number(user.balance),
    subscriptions: user.subscriptions.map((s) => ({
      ...s,
      modelProfile: {
        ...s.modelProfile,
        subscriptionPrice: Number(s.modelProfile.subscriptionPrice),
        imageUrl: s.modelProfile.referenceImages?.[0]?.imageUrl ?? null,
      },
    })),
    modelProfiles: user.modelProfiles.map((mp) => ({
      ...mp,
      subscriptionPrice: Number(mp.subscriptionPrice),
      subscriberCount: mp.subscriptions.length,
      contentCount: mp._count.contentPosts,
      imageUrl: mp.referenceImages[0]?.imageUrl ?? null,
    })),
    sentTransactions: user.sentTransactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
    })),
    receivedTransactions: user.receivedTransactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
    })),
  };

  if (user.role === "CREATOR") {
    return <CreatorDashboard user={serializedUser} />;
  }

  return <ClientDashboard user={serializedUser} />;
}
