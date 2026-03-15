import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ModelForm } from "@/components/model/model-form";

export default async function EditModelPage({
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
    },
  });

  if (!model || model.userId !== session.user.id) {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  return (
    <ModelForm
      initialData={{
        id: model.id,
        name: model.name,
        age: model.age,
        nationality: model.nationality,
        bio: model.bio,
        bodyType: model.bodyType || undefined,
        hairColor: model.hairColor || undefined,
        hairType: model.hairType || undefined,
        ethnicity: model.ethnicity || undefined,
        height: model.height || undefined,
        subscriptionPrice: Number(model.subscriptionPrice),
        exclusivityPrice: model.exclusivityPrice ? Number(model.exclusivityPrice) : 0,
        chatPersonality: model.chatPersonality || undefined,
        backstory: model.backstory || undefined,
        chatAutomatic: model.chatAutomatic,
        referenceImages: model.referenceImages.map((img) => ({
          id: img.id,
          imageUrl: img.imageUrl,
        })),
      }}
    />
  );
}
