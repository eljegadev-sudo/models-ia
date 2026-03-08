"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users, Image as ImageIcon, Heart } from "lucide-react";
import NextImage from "next/image";
import { toast } from "sonner";

interface ModelCard {
  id: string;
  slug: string;
  name: string;
  age: number;
  nationality: string;
  bio: string;
  subscriptionPrice: number;
  subscriberCount: number;
  postCount: number;
  coverImage: string | null;
}

export function ExploreGrid() {
  const t = useTranslations("explore");
  const [models, setModels] = useState<ModelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchModels();
    fetchFavorites();
  }, [sort]);

  async function fetchModels() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, ...(search && { search }) });
      const res = await fetch(`/api/models?${params}`);
      const data = await res.json();
      setModels(data.models || []);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFavorites() {
    try {
      const res = await fetch("/api/favorites");
      if (res.ok) {
        const data = await res.json();
        setFavorites(new Set(data.map((f: { id: string }) => f.id)));
      }
    } catch {
      // Not logged in or error
    }
  }

  async function toggleFavorite(e: React.MouseEvent, modelId: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelProfileId: modelId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFavorites((prev) => {
        const next = new Set(prev);
        if (data.favorited) next.add(modelId);
        else next.delete(modelId);
        return next;
      });
    } catch {
      toast.error("Sign in to add favorites");
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchModels();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="pl-9"
          />
        </form>
        <Select value={sort} onValueChange={(v) => v && setSort(v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("newest")}</SelectItem>
            <SelectItem value="popular">{t("popular")}</SelectItem>
            <SelectItem value="priceAsc">{t("priceAsc")}</SelectItem>
            <SelectItem value="priceDesc">{t("priceDesc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[3/4]" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg text-muted-foreground">{t("noResults")}</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {models.map((model) => (
            <Link
              key={model.id}
              href={`/model/${model.slug}`}
              className="group"
            >
              <Card className="overflow-hidden transition-all hover:shadow-lg hover:shadow-pink-500/5 hover:border-pink-500/30">
                <div className="relative aspect-[3/4] bg-muted">
                  {model.coverImage ? (
                    <NextImage
                      src={model.coverImage}
                      alt={model.name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <button
                    onClick={(e) => toggleFavorite(e, model.id)}
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60"
                  >
                    <Heart
                      className={`h-4 w-4 transition-colors ${
                        favorites.has(model.id)
                          ? "fill-pink-500 text-pink-500"
                          : "text-white"
                      }`}
                    />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <h3 className="text-lg font-semibold text-white">
                      {model.name}
                    </h3>
                    <p className="text-sm text-white/70">
                      {model.age} - {model.nationality}
                    </p>
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                    {model.bio}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {model.subscriberCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" />
                        {model.postCount}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      ${model.subscriptionPrice}/mo
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
