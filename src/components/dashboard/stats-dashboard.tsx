"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";
import {
  DollarSign,
  Users,
  MessageSquare,
  Image as ImageIcon,
  TrendingUp,
  Crown,
  ArrowLeft,
  Heart,
  MessageCircle,
  Gift,
  BarChart3,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Image from "next/image";

interface StatsDashboardProps {
  overview: {
    totalRevenue: number;
    totalSubscribers: number;
    totalMessages: number;
    totalPosts: number;
    balance: number;
  };
  revenueByDay: { date: string; amount: number }[];
  revenueByType: { type: string; amount: number }[];
  topClients: {
    id: string;
    username: string;
    avatar: string | null;
    totalSpent: number;
    messages: number;
    subscriptions: string[];
    lastActive: string | null;
  }[];
  modelStats: {
    id: string;
    name: string;
    imageUrl: string | null;
    subscribers: number;
    revenue: number;
    posts: number;
    likes: number;
    comments: number;
    tips: number;
    tipRevenue: number;
    messages: number;
    conversations: number;
    stories: number;
  }[];
  topPosts: {
    id: string;
    imageUrl: string;
    caption: string | null;
    modelName: string;
    likes: number;
    comments: number;
    tips: number;
    tipRevenue: number;
  }[];
}

const TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION: "Suscripciones",
  TIP: "Propinas",
  CONTENT_UNLOCK: "Contenido",
  MESSAGE_UNLOCK: "Mensajes",
};

const PIE_COLORS = ["#6366f1", "#22c55e", "#a855f7", "#ec4899"];

function formatCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function StatsDashboard({
  overview,
  revenueByDay,
  revenueByType,
  topClients,
  modelStats,
  topPosts,
}: StatsDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Estadísticas</h1>
          <p className="text-muted-foreground">
            Análisis detallado de tu rendimiento
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard
          title="Ingresos Totales"
          value={formatCurrency(overview.totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-green-500"
        />
        <MetricCard
          title="Balance"
          value={formatCurrency(overview.balance)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MetricCard
          title="Suscriptores"
          value={overview.totalSubscribers.toString()}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          title="Mensajes"
          value={overview.totalMessages.toLocaleString()}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <MetricCard
          title="Publicaciones"
          value={overview.totalPosts.toString()}
          icon={<ImageIcon className="h-4 w-4" />}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="models">Modelos</TabsTrigger>
          <TabsTrigger value="content">Contenido</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">
                  Ingresos últimos 30 días
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueByDay}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v: string) => v.slice(5)}
                        className="text-xs"
                        tick={{ fill: "currentColor", fontSize: 11 }}
                      />
                      <YAxis
                        tickFormatter={(v: number) => `$${v}`}
                        tick={{ fill: "currentColor", fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), "Ingresos"]}
                        labelFormatter={(label: string) => `Fecha: ${label}`}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Ingresos por tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {revenueByType.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueByType}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="amount"
                          nameKey="type"
                        >
                          {revenueByType.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            TYPE_LABELS[name] || name,
                          ]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend
                          formatter={(value: string) => TYPE_LABELS[value] || value}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      Sin datos aún
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {modelStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Rendimiento por modelo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelStats}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "currentColor", fontSize: 11 }}
                      />
                      <YAxis tick={{ fill: "currentColor", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="subscribers" name="Suscriptores" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="likes" name="Likes" fill="#ec4899" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="messages" name="Mensajes" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Top clientes por gasto
                </CardTitle>
                <Badge variant="secondary">{topClients.length} clientes</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {topClients.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  Aún no tienes clientes
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-6 gap-4 border-b pb-2 text-xs font-medium text-muted-foreground">
                    <span className="col-span-2">Cliente</span>
                    <span className="text-right">Gastado</span>
                    <span className="text-right">Mensajes</span>
                    <span>Suscripciones</span>
                    <span className="text-right">Última act.</span>
                  </div>
                  {topClients.map((client, idx) => (
                    <div
                      key={client.id}
                      className="grid grid-cols-6 gap-4 items-center rounded-lg py-2 px-1 hover:bg-accent/50 transition-colors"
                    >
                      <div className="col-span-2 flex items-center gap-3">
                        <span className="w-5 text-xs text-muted-foreground font-medium">
                          {idx + 1}
                        </span>
                        {idx < 3 && (
                          <Crown className={`h-4 w-4 ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : "text-amber-700"}`} />
                        )}
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {client.avatar ? (
                            <Image
                              src={client.avatar}
                              alt={client.username}
                              width={32}
                              height={32}
                              className="object-cover"
                            />
                          ) : (
                            <span className="text-xs font-bold">
                              {client.username[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium truncate">
                          @{client.username}
                        </span>
                      </div>
                      <span className="text-right text-sm font-semibold text-green-500">
                        {formatCurrency(client.totalSpent)}
                      </span>
                      <span className="text-right text-sm">
                        {client.messages.toLocaleString()}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {client.subscriptions.slice(0, 2).map((name) => (
                          <Badge key={name} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {name}
                          </Badge>
                        ))}
                        {client.subscriptions.length > 2 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            +{client.subscriptions.length - 2}
                          </Badge>
                        )}
                      </div>
                      <span className="text-right text-xs text-muted-foreground">
                        {timeAgo(client.lastActive)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="mt-4 space-y-4">
          {modelStats.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No tienes modelos aún</p>
            </Card>
          ) : (
            modelStats.map((model) => (
              <Card key={model.id} className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 flex-shrink-0 rounded-xl overflow-hidden bg-muted">
                      {model.imageUrl ? (
                        <Image
                          src={model.imageUrl}
                          alt={model.name}
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
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold">{model.name}</h3>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard/manager/models/${model.id}/content`}>
                              Contenido
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard/manager/models/${model.id}/edit`}>
                              Editar
                            </Link>
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                        <StatItem
                          icon={<Users className="h-3.5 w-3.5" />}
                          label="Suscriptores"
                          value={model.subscribers}
                        />
                        <StatItem
                          icon={<DollarSign className="h-3.5 w-3.5" />}
                          label="Propinas"
                          value={formatCurrency(model.tipRevenue)}
                        />
                        <StatItem
                          icon={<ImageIcon className="h-3.5 w-3.5" />}
                          label="Posts"
                          value={model.posts}
                        />
                        <StatItem
                          icon={<Heart className="h-3.5 w-3.5" />}
                          label="Likes"
                          value={model.likes}
                        />
                        <StatItem
                          icon={<MessageCircle className="h-3.5 w-3.5" />}
                          label="Comentarios"
                          value={model.comments}
                        />
                        <StatItem
                          icon={<MessageSquare className="h-3.5 w-3.5" />}
                          label="Mensajes"
                          value={model.messages.toLocaleString()}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Publicaciones más populares
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPosts.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  Sin publicaciones aún
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {topPosts.map((post) => (
                    <div key={post.id} className="group relative overflow-hidden rounded-xl border">
                      <div className="relative aspect-square">
                        <Image
                          src={post.imageUrl}
                          alt={post.caption || "Post"}
                          fill
                          className="object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white font-medium truncate">
                            {post.modelName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2.5 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-pink-500">
                            <Heart className="h-3 w-3" /> {post.likes}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MessageCircle className="h-3 w-3" /> {post.comments}
                          </span>
                          <span className="flex items-center gap-1 text-green-500">
                            <Gift className="h-3 w-3" /> {post.tips}
                          </span>
                        </div>
                        {post.tipRevenue > 0 && (
                          <span className="font-semibold text-green-500">
                            {formatCurrency(post.tipRevenue)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon} {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
