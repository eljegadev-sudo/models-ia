"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Wallet } from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  createdAt: Date;
  fromUser: { username: string };
}

interface EarningsDashboardProps {
  transactions: Transaction[];
  totalEarnings: number;
  balance: number;
}

export function EarningsDashboard({
  transactions,
  totalEarnings,
  balance,
}: EarningsDashboardProps) {
  const t = useTranslations("payments");

  const typeColors: Record<string, string> = {
    SUBSCRIPTION: "bg-blue-500/10 text-blue-500",
    TIP: "bg-green-500/10 text-green-500",
    CONTENT_UNLOCK: "bg-purple-500/10 text-purple-500",
    MESSAGE_UNLOCK: "bg-pink-500/10 text-pink-500",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Earnings</h1>
        <p className="text-muted-foreground">Track your revenue and transactions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalEarnings.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("balance")}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      className={`text-xs ${typeColors[tx.type] || ""}`}
                      variant="secondary"
                    >
                      {t(`type.${tx.type}` as `type.${keyof typeof typeColors}`)}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        From @{tx.fromUser.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-green-500">
                    +${tx.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
