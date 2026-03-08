import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ModelForm } from "@/components/model/model-form";

export default async function NewModelPage() {
  const session = await auth();
  const locale = await getLocale();

  if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  return <ModelForm />;
}
