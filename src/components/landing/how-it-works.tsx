"use client";

import { useTranslations } from "next-intl";
import { Search, Heart, MessageCircle } from "lucide-react";

const steps = [
  { key: "step1", icon: Search, number: "01" },
  { key: "step2", icon: Heart, number: "02" },
  { key: "step3", icon: MessageCircle, number: "03" },
] as const;

export function HowItWorks() {
  const t = useTranslations("landing.howItWorks");

  return (
    <section className="relative py-20 md:py-28">
      <div className="absolute inset-0 -z-10 bg-muted/30" />
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">{t("title")}</h2>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.key} className="relative text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-pink-500/10">
                  <Icon className="h-8 w-8 text-pink-500" />
                </div>
                <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-3 text-6xl font-bold text-pink-500/10">
                  {step.number}
                </span>
                <h3 className="mb-3 text-xl font-semibold">
                  {t(`${step.key}.title`)}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t(`${step.key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
