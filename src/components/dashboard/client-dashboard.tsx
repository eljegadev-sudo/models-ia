"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { CreditCard, DollarSign, Heart, Compass } from "lucide-react";

interface ClientDashboardProps {
  user: {
    username: string;
    balance: number;
    subscriptions: {
      id: string;
      status: string;
      modelProfile: {
        name: string;
        slug: string;
        subscriptionPrice: number;
      };
    }[];
    sentTransactions: {
      id: string;
      type: string;
      amount: number;
      createdAt: Date;
    }[];
  };
}

export function ClientDashboard({ user }: ClientDashboardProps) {
  const t = useTranslations("dashboard.client");

  const totalSpent = user.sentTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("activeSubscriptions")}
            </CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user.subscriptions.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("totalSpent")}
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSpent.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("balance")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${user.balance.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("activeSubscriptions")}</h2>
        {user.subscriptions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="mb-4 text-muted-foreground">{t("noSubscriptions")}</p>
            <Button asChild>
              <Link href="/explore" className="gap-2">
                <Compass className="h-4 w-4" />
                {t("exploreModels")}
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {user.subscriptions.map((sub) => (
              <Card key={sub.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">
                        {sub.modelProfile.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        ${sub.modelProfile.subscriptionPrice}/mo
                      </p>
                    </div>
                    <Badge variant="secondary">{sub.status}</Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/model/${sub.modelProfile.slug}`}>
                        Profile
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/model/${sub.modelProfile.slug}/chat`}>
                        Chat
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
