import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ContentManager } from "@/components/content/content-manager";

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const locale = await getLocale();
  const { id } = await params;

  if (!session?.user) {
    redirect({ href: "/auth/login", locale: locale as "es" | "en" });
    return null;
  }

  const model = await prisma.modelProfile.findUnique({
    where: { id },
    include: {
      referenceImages: { orderBy: { orderIndex: "asc" } },
      contentPosts: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { likes: true, comments: true, tips: true } },
          tips: { select: { amount: true } },
          comments: {
            include: { user: { select: { id: true, username: true, avatar: true } } },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      },
    },
  });

  if (!model || model.userId !== session.user.id) {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  const serialized = {
    ...model,
    subscriptionPrice: Number(model.subscriptionPrice),
    contentPosts: model.contentPosts.map((p) => ({
      ...p,
      price: Number(p.price),
      likesCount: p._count.likes,
      commentsCount: p._count.comments,
      tipsCount: p._count.tips,
      tipRevenue: p.tips.reduce((s, t) => s + Number(t.amount), 0),
      comments: p.comments,
    })),
  };

  return <ContentManager model={serialized} />;
}
