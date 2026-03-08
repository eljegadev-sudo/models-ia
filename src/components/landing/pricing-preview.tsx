"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { Check } from "lucide-react";

const plans = [
  { key: "free" as const, featureCount: 3, highlighted: false },
  { key: "subscriber" as const, featureCount: 5, highlighted: true },
];

export function PricingPreview() {
  const t = useTranslations("landing.pricing");

  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">{t("title")}</h2>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
          {plans.map(({ key: plan, featureCount, highlighted }) => {
            const features: string[] = [];
            for (let i = 0; i < featureCount; i++) {
              features.push(t(`${plan}.features.${i}`));
            }

            return (
              <Card
                key={plan}
                className={`relative transition-all hover:shadow-lg ${
                  highlighted
                    ? "border-pink-500 shadow-lg shadow-pink-500/10"
                    : "border-border/50"
                }`}
              >
                {highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-pink-500 px-3">Popular</Badge>
                  </div>
                )}
                <CardHeader className="pb-4 pt-6 text-center">
                  <h3 className="text-xl font-bold">{t(`${plan}.name`)}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{t(`${plan}.price`)}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(`${plan}.description`)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${highlighted ? "bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white" : ""}`}
                    variant={highlighted ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/auth/register">
                      {t(`${plan}.name`)}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
