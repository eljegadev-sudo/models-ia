import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ModelProfileView } from "@/components/model/model-profile-view";

export default async function ModelProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  const model = await prisma.modelProfile.findUnique({
    where: { slug },
    include: {
      referenceImages: { orderBy: { orderIndex: "asc" } },
      contentPosts: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { likes: true, comments: true } },
        },
      },
      stories: {
        where: { status: "APPROVED", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { subscriptions: true } },
    },
  });

  if (!model || !model.isActive) notFound();

  if (model.exclusiveOwnerId && model.exclusiveOwnerId !== session?.user?.id) {
    notFound();
  }

  let isSubscribed = false;
  let isFavorited = false;
  let userLikedPostIds = new Set<string>();
  let userSavedPostIds = new Set<string>();

  if (session?.user) {
    const postIds = model.contentPosts.map((p) => p.id);
    const [sub, fav, likes, saves] = await Promise.all([
      prisma.subscription.findUnique({
        where: {
          clientId_modelProfileId: {
            clientId: session.user.id,
            modelProfileId: model.id,
          },
        },
      }),
      prisma.favorite.findUnique({
        where: {
          userId_modelProfileId: {
            userId: session.user.id,
            modelProfileId: model.id,
          },
        },
      }),
      prisma.postLike.findMany({
        where: { userId: session.user.id, postId: { in: postIds } },
        select: { postId: true },
      }),
      prisma.savedPost.findMany({
        where: { userId: session.user.id, postId: { in: postIds } },
        select: { postId: true },
      }),
    ]);
    isSubscribed = sub?.status === "ACTIVE";
    isFavorited = !!fav;
    userLikedPostIds = new Set(likes.map((l) => l.postId));
    userSavedPostIds = new Set(saves.map((s) => s.postId));
  }

  const serialized = {
    ...model,
    subscriptionPrice: Number(model.subscriptionPrice),
    exclusivityPrice: model.exclusivityPrice ? Number(model.exclusivityPrice) : null,
    isExclusiveOwner: !!session?.user && model.exclusiveOwnerId === session.user.id,
    subscriberCount: model._count.subscriptions,
    contentPosts: model.contentPosts.map((p) => ({
      ...p,
      price: Number(p.price),
      likesCount: p._count.likes,
      commentsCount: p._count.comments,
      isLiked: userLikedPostIds.has(p.id),
      isSaved: userSavedPostIds.has(p.id),
    })),
    stories: model.stories.map((s) => ({
      id: s.id,
      imageUrl: s.imageUrl,
      caption: s.caption,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <ModelProfileView
          model={serialized}
          isSubscribed={isSubscribed}
          isLoggedIn={!!session}
          isFavorited={isFavorited}
        />
      </main>
      <Footer />
    </div>
  );
}
