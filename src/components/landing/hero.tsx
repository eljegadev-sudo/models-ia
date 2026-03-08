"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Heart, Users } from "lucide-react";

export function Hero() {
  const t = useTranslations("landing");

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-rose-500/10 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 py-20 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-4 py-1.5 text-sm">
            <Heart className="h-3.5 w-3.5 text-pink-500" />
            {t("badge")}
          </Badge>

          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            {t("title")}{" "}
            <span className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 bg-clip-text text-transparent">
              {t("titleHighlight")}
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
            {t("subtitle")}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="gap-2 px-8 text-base bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white" asChild>
              <Link href="/explore">
                {t("cta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 px-8 text-base"
              asChild
            >
              <Link href="/auth/register">{t("ctaSecondary")}</Link>
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-8 border-t border-border/40 pt-8">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Heart className="h-5 w-5 text-pink-500" />
                <span className="text-2xl font-bold md:text-3xl">500+</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("stats.models")}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Users className="h-5 w-5 text-pink-500" />
                <span className="text-2xl font-bold md:text-3xl">15K+</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("stats.subscribers")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
