"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  Users,
  DollarSign,
  Image as ImageIcon,
  Plus,
  Settings,
  BarChart3,
} from "lucide-react";

interface CreatorDashboardProps {
  user: {
    username: string;
    balance: number;
    modelProfiles: {
      id: string;
      name: string;
      slug: string;
      isActive: boolean;
      subscriptionPrice: number;
      subscriberCount: number;
      contentCount: number;
    }[];
    receivedTransactions: {
      id: string;
      type: string;
      amount: number;
      createdAt: Date;
    }[];
  };
}

export function CreatorDashboard({ user }: CreatorDashboardProps) {
  const t = useTranslations("dashboard.creator");

  const totalSubscribers = user.modelProfiles.reduce(
    (sum, mp) => sum + mp.subscriberCount,
    0
  );
  const totalEarnings = user.receivedTransactions.reduce(
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
          <Link href="/dashboard/manager/models/new">
            <Plus className="h-4 w-4" />
            {t("createModel")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("totalModels")}
            </CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {user.modelProfiles.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("totalSubscribers")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubscribers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("totalEarnings")}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalEarnings.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("balance")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${user.balance.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("myModels")}</h2>
        {user.modelProfiles.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="mb-4 text-muted-foreground">{t("noModels")}</p>
            <Button asChild className="gap-2">
              <Link href="/dashboard/manager/models/new">
                <Plus className="h-4 w-4" />
                {t("createModel")}
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {user.modelProfiles.map((model) => (
              <Card key={model.id} className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{model.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        @{model.slug}
                      </p>
                    </div>
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        model.isActive ? "bg-green-500" : "bg-muted"
                      }`}
                    />
                  </div>
                  <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <div className="font-semibold">
                        {model.subscriberCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Subs</div>
                    </div>
                    <div>
                      <div className="font-semibold">{model.contentCount}</div>
                      <div className="text-xs text-muted-foreground">Posts</div>
                    </div>
                    <div>
                      <div className="font-semibold">
                        ${model.subscriptionPrice}
                      </div>
                      <div className="text-xs text-muted-foreground">Price</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 gap-1" asChild>
                      <Link href={`/dashboard/manager/models/${model.id}/content`}>
                        <ImageIcon className="h-3.5 w-3.5" />
                        Content
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" asChild>
                      <Link href={`/dashboard/manager/models/${model.id}/edit`}>
                        <Settings className="h-3.5 w-3.5" />
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
