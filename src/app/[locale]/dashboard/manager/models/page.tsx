import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function ModelsPage() {
  const locale = await getLocale();
  redirect({ href: "/dashboard", locale: locale as "es" | "en" });
}
