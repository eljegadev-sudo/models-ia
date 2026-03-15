import { prisma } from "@/lib/prisma";

export async function notifySubscribers(
  modelProfileId: string,
  type: string,
  title: string,
  body: string,
  imageUrl?: string,
  link?: string
) {
  const subs = await prisma.subscription.findMany({
    where: { modelProfileId, status: "ACTIVE" },
    select: { clientId: true },
  });

  if (subs.length === 0) return;

  await prisma.notification.createMany({
    data: subs.map((s) => ({
      userId: s.clientId,
      type,
      title,
      body,
      imageUrl,
      link,
    })),
  });
}
