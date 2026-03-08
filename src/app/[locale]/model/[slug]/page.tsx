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
      },
      _count: { select: { subscriptions: true } },
    },
  });

  if (!model || !model.isActive) notFound();

  let isSubscribed = false;
  let isFavorited = false;

  if (session?.user) {
    const [sub, fav] = await Promise.all([
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
    ]);
    isSubscribed = sub?.status === "ACTIVE";
    isFavorited = !!fav;
  }

  const serialized = {
    ...model,
    subscriptionPrice: Number(model.subscriptionPrice),
    subscriberCount: model._count.subscriptions,
    contentPosts: model.contentPosts.map((p) => ({
      ...p,
      price: Number(p.price),
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
