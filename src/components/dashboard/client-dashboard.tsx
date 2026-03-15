"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import {
  CreditCard,
  DollarSign,
  Heart,
  Compass,
  MessageSquare,
  Image as ImageIcon,
} from "lucide-react";
import NextImage from "next/image";

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
        imageUrl?: string | null;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/explore">
            <Compass className="h-4 w-4" />
            Explorar modelos
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("activeSubscriptions")}
            </CardTitle>
            <Heart className="h-4 w-4 text-pink-500" />
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
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              ${user.balance.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("activeSubscriptions")}</h2>
        {user.subscriptions.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Heart className="h-8 w-8 text-muted-foreground" />
            </div>
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
                <div className="flex gap-4 p-4">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                    {sub.modelProfile.imageUrl ? (
                      <NextImage
                        src={sub.modelProfile.imageUrl}
                        alt={sub.modelProfile.name}
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{sub.modelProfile.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          ${sub.modelProfile.subscriptionPrice}/mes
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          sub.status === "ACTIVE"
                            ? "bg-green-500/10 text-green-500"
                            : ""
                        }
                      >
                        {sub.status === "ACTIVE" ? "Activa" : sub.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1" asChild>
                        <Link href={`/model/${sub.modelProfile.slug}`}>
                          <ImageIcon className="h-3.5 w-3.5" />
                          Perfil
                        </Link>
                      </Button>
                      <Button size="sm" className="flex-1 gap-1" asChild>
                        <Link href={`/model/${sub.modelProfile.slug}/chat`}>
                          <MessageSquare className="h-3.5 w-3.5" />
                          Chat
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
