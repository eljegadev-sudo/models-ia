import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ChatConfig } from "@/components/model/chat-config";

export default async function ModelChatConfigPage({
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
    select: {
      id: true,
      name: true,
      chatAutomatic: true,
      chatPersonality: true,
      eroticLevel: true,
      userId: true,
    },
  });

  if (!model || model.userId !== session.user.id) {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  const conversations = await prisma.conversation.findMany({
    where: { modelProfileId: id },
    include: {
      client: { select: { username: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <ChatConfig
      model={{
        id: model.id,
        name: model.name,
        chatAutomatic: model.chatAutomatic,
        chatPersonality: model.chatPersonality,
        eroticLevel: model.eroticLevel,
      }}
      conversations={conversations.map((c) => ({
        id: c.id,
        clientUsername: c.client.username,
        messageCount: c._count.messages,
        lastMessage: c.messages[0]?.content || null,
        lastMessageAt: c.messages[0]?.createdAt || c.createdAt,
        isAutomated: c.isAutomated,
        aiEnabled: c.aiEnabled,
        eroticLevel: c.eroticLevel,
        memoryContext: c.memoryContext,
        preferredName: c.preferredName,
      }))}
    />
  );
}
