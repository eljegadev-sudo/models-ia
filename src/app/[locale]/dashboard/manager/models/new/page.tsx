import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { ModelForm } from "@/components/model/model-form";

export default async function NewModelPage() {
  const session = await auth();
  const locale = await getLocale();

  if (!session?.user) {
    redirect({ href: "/auth/login", locale: locale as "es" | "en" });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!user || user.role !== "CREATOR") {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  return <ModelForm />;
}
