import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { Navbar } from "@/components/layout/navbar";
import { ChatInterface } from "@/components/chat/chat-interface";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const locale = await getLocale();

  if (!session?.user) {
    redirect({ href: "/auth/login", locale: locale as "es" | "en" });
    return null;
  }

  const model = await prisma.modelProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      chatAutomatic: true,
      referenceImages: { take: 1, orderBy: { orderIndex: "asc" } },
    },
  });

  if (!model) notFound();

  const sub = await prisma.subscription.findUnique({
    where: {
      clientId_modelProfileId: {
        clientId: session.user.id,
        modelProfileId: model.id,
      },
    },
  });

  if (!sub || sub.status !== "ACTIVE") {
    redirect({ href: `/model/${slug}`, locale: locale as "es" | "en" });
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <Navbar />
      <ChatInterface
        modelProfileId={model.id}
        modelName={model.name}
        modelSlug={model.slug}
        modelAvatar={model.referenceImages[0]?.imageUrl}
        isAutomatic={model.chatAutomatic}
      />
    </div>
  );
}
