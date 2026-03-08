"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  const t = useTranslations("landing.ctaSection");

  return (
    <section className="relative py-20 md:py-28">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-1/2 h-[300px] w-[400px] -translate-y-1/2 rounded-full bg-pink-500/15 blur-[100px]" />
        <div className="absolute right-1/4 top-1/2 h-[300px] w-[400px] -translate-y-1/2 rounded-full bg-rose-500/15 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-5xl">{t("title")}</h2>
          <p className="mb-8 text-lg text-muted-foreground">{t("subtitle")}</p>
          <Button size="lg" className="gap-2 px-10 text-base bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white" asChild>
            <Link href="/auth/register">
              {t("button")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
