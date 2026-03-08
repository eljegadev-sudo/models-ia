"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, ImageIcon, Heart, Zap } from "lucide-react";

const featureIcons = [MessageCircle, ImageIcon, Heart, Zap];

const featureKeys = [
  "intimateChat",
  "exclusiveContent",
  "realConnection",
  "yourTerms",
] as const;

export function Features() {
  const t = useTranslations("landing.features");

  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">{t("title")}</h2>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {featureKeys.map((key, i) => {
            const Icon = featureIcons[i];
            return (
              <Card
                key={key}
                className="group border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:border-pink-500/30 hover:shadow-lg hover:shadow-pink-500/5"
              >
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500 transition-colors group-hover:bg-pink-500 group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">
                    {t(`${key}.title`)}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(`${key}.description`)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
